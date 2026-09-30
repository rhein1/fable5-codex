"""Offline grader tests with host-owned source facts, not keyword scores."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("rrsi_evaluator", ROOT / "plugins/fable5-codex/experiments/rrsi/evaluator.py")
e = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = e
SPEC.loader.exec_module(e)


def task(identifier, split, prompt):
    source = "export const enabled = false;"
    return {"id": identifier, "repository": "repo-" + identifier, "family": "family-" + identifier,
            "split": split, "prompt": prompt, "sources": {"worker.js": source + "\n"},
            "assertions": [{"id": "enabled-state", "path": "worker.enabled", "equals": False,
                            "evidence": {"path": "worker.js", "line": 1, "content_digest": e.digest(source.encode())}}]}


def tasks():
    return [task("a", "evolve", "Determine whether the worker launches on startup."),
            task("b", "heldout", "Explain whether the supplied flag enables asynchronous dispatch."),
            task("c", "ood", "Audit the fixture for unsupported assertions about production activation.")]


def config(**changes):
    args = {"suite_id": "fixture-suite", "tasks": tasks(), "weights": {"uniform": 1},
            "model": {"provider": "synthetic", "name": "fixture", "effort": "low"},
            "runtime": {"workers": 1, "timeout_ms": 5000, "max_retries": 2, "heldout_attempt_cap": 2},
            "split": {"tasks": {"evolve": ["a"], "heldout": ["b"], "ood": ["c"]}}}
    args.update(changes)
    return e.freeze_evaluation_config(**args)


def slot(frozen, arm="candidate", **changes):
    args = dict(task_id="a", experiment_id="experiment", baseline_commit="a" * 40,
                candidate_commit="b" * 40, arm=arm, trial_id="trial-1", seed=4, snapshot_digest="c" * 64)
    args.update(changes)
    return e.expected_slot(frozen, **args)


def result():
    return {"facts": {"worker": {"enabled": False}},
            "evidence": {"worker": {"enabled": tasks()[0]["assertions"][0]["evidence"]}}}


def observation(expected, **changes):
    output = result()
    row = {**expected, "attempt": 0, "status": "completed", "terminal": True,
           "result": output, "output_digest": e.digest(output), "cost_microusd": 100,
           "policy_tokens": 20, "duration_ms": 50, "safety": {key: True for key in e.SAFETY_GUARDS}}
    row.update(changes)
    if "result" in changes and "output_digest" not in changes:
        row["output_digest"] = e.digest(row["result"])
    return row


class EvaluatorTests(unittest.TestCase):
    def setUp(self):
        self.config = config()
        self.slot = slot(self.config)
        self.row = observation(self.slot)

    def aggregate(self, rows, slots=None):
        return e.aggregate_results(observations=rows, expected_slots=slots or [self.slot], config=self.config, synthetic=True)

    def test_freeze_is_immutable_and_binds_actual_grader_source(self):
        self.assertEqual(self.config.evaluator_digest, e.digest(Path(e.__file__).read_bytes()))
        with self.assertRaises(TypeError): self.config.model["name"] = "altered"
        with self.assertRaises(TypeError): self.config.tasks[0]["assertions"][0]["equals"] = True
        self.assertNotEqual(self.config.config_digest, config(model={"provider": "synthetic", "name": "other", "effort": "low"}).config_digest)
        self.assertEqual(self.config.config_digest, config().config_digest)

    def test_invalid_weights_runtime_model_and_task_grader_rejected(self):
        for changes in ({"weights": {"uniform": True}}, {"weights": {"quality": 5}},
                        {"runtime": {**dict(self.config.runtime), "max_retries": -1}},
                        {"runtime": {**dict(self.config.runtime), "heldout_attempt_cap": True}},
                        {"model": {"name": "fixture"}}):
            with self.subTest(changes=changes), self.assertRaises(e.EvaluationDenied): config(**changes)
        broken = tasks(); broken[0]["assertions"][0]["evidence"]["content_digest"] = "0" * 64
        with self.assertRaises(e.EvaluationDenied): config(tasks=broken)

    def test_repository_and_family_leakage_rejected(self):
        for field in ("repository", "family"):
            leaked = tasks(); leaked[1][field] = leaked[0][field]
            with self.subTest(field=field), self.assertRaises(e.EvaluationDenied): config(tasks=leaked)

    def test_duplicate_prompts_cannot_hide_behind_metadata(self):
        for prompt in (tasks()[0]["prompt"], "  " + tasks()[0]["prompt"].upper() + "  ", tasks()[0]["prompt"] + "!"):
            leaked = tasks(); leaked[2]["prompt"] = prompt
            with self.subTest(prompt=prompt), self.assertRaises(e.EvaluationDenied): config(tasks=leaked)

    def test_duplicate_or_missing_split_members_denied(self):
        for ids in (["a", "a"], [], ["unknown"]):
            with self.subTest(ids=ids), self.assertRaises(e.EvaluationDenied):
                config(split={"tasks": {"evolve": ids, "heldout": ["b"], "ood": ["c"]}})

    def test_candidate_packet_omits_assertions_and_seals_heldout_and_ood(self):
        packet = e.public_task_packet(tasks()[0])
        self.assertNotIn("assertions", packet)
        self.assertEqual(packet["sources"], tasks()[0]["sources"])
        for task_value in tasks()[1:]:
            with self.assertRaises(e.EvaluationDenied): e.public_task_packet(task_value)

    def test_correct_facts_and_actual_source_citation_score_one(self):
        self.assertEqual(e.grade_factual_task(tasks()[0], result())["score"], 1)

    def test_wrong_missing_or_type_coerced_facts_score_zero(self):
        for actual in (True, 0, "false", None):
            output = result(); output["facts"]["worker"]["enabled"] = actual
            self.assertEqual(e.grade_factual_task(tasks()[0], output)["score"], 0)
        output = result(); output["facts"] = {}
        self.assertEqual(e.grade_factual_task(tasks()[0], output)["score"], 0)

    def test_wrong_path_line_digest_or_empty_citation_scores_zero(self):
        for citation in ({}, {"path": "elsewhere.js", "line": 1, "content_digest": "a" * 64},
                         {**tasks()[0]["assertions"][0]["evidence"], "line": 2},
                         {**tasks()[0]["assertions"][0]["evidence"], "content_digest": "f" * 64}):
            output = result(); output["evidence"]["worker"]["enabled"] = citation
            self.assertEqual(e.grade_factual_task(tasks()[0], output)["score"], 0)

    def test_free_prose_requires_human_and_does_not_return_private_text(self):
        answer = e.adjudicate_free_prose(candidate="private prose", rubric={"truth": "verify"})
        self.assertIsNone(answer["score"])
        self.assertEqual(answer["status"], "human_adjudication_required")
        self.assertNotIn("candidate", answer)

    def test_live_envelope_and_aggregate_always_refuse(self):
        for envelope in (None, {"authenticated": True, "authority_ref": "forged"}):
            with self.assertRaisesRegex(e.EvaluationDenied, "qualified_host_importer_missing"):
                e.import_observation(self.row, host_envelope=envelope)
        with self.assertRaisesRegex(e.EvaluationDenied, "qualified_host_importer_missing"):
            e.aggregate_results(observations=[self.row], expected_slots=[self.slot], config=self.config)
        imported = e.import_observation(self.row, synthetic=True)
        self.assertFalse(imported["trusted"])
        aggregate = self.aggregate([self.row])
        self.assertTrue(aggregate["comparable_synthetic"])
        self.assertFalse(aggregate["accepted"])
        self.assertFalse(aggregate["promotion_allowed"])

    def test_forged_output_digest_or_score_field_rejected(self):
        for changes in ({"output_digest": "0" * 64}, {"score": 1}, {"self_hash": "forged"}):
            with self.assertRaises(e.EvaluationDenied): self.aggregate([{**self.row, **changes}])

    def test_missing_trials_remain_in_denominator(self):
        answer = self.aggregate([self.row], [self.slot, slot(self.config, trial_id="trial-2")])
        self.assertEqual(answer["score"], 0.5)
        self.assertEqual(answer["missing_trials"], 1)
        self.assertFalse(answer["comparable_synthetic"])

    def test_retries_count_cost_once_each_not_extra_rewards(self):
        failed = observation(self.slot, status="failed", result=None)
        retry = observation(self.slot, attempt=1, cost_microusd=70, policy_tokens=7)
        answer = self.aggregate([failed, retry])
        self.assertEqual(answer["score"], 1)
        self.assertEqual(answer["completed"], 1)
        self.assertEqual(answer["total_cost_microusd"], 170)
        self.assertEqual(answer["total_policy_tokens"], 27)

    def test_later_unknown_attempt_cannot_select_earlier_success(self):
        retry = observation(self.slot, attempt=1, status="timeout", terminal=False, result=None)
        answer = self.aggregate([self.row, retry])
        self.assertEqual(answer["score"], 0)
        self.assertEqual(answer["completed"], 0)
        self.assertFalse(answer["comparable_synthetic"])
        self.assertEqual(answer["total_cost_microusd"], 200)

    def test_duplicate_gapped_fabricated_and_excess_retries_denied(self):
        for rows in ([self.row, self.row], [observation(self.slot, attempt=1)],
                     [observation(slot(self.config, trial_id="unknown"))],
                     [observation(self.slot, attempt=i) for i in range(4)]):
            with self.subTest(rows=rows), self.assertRaises(e.EvaluationDenied): self.aggregate(rows)

    def test_unknown_negative_nonfinite_boolean_costs_rejected_and_zero_blocks(self):
        for field in ("cost_microusd", "policy_tokens", "duration_ms"):
            for value in (None, -1, True, float("nan"), float("inf"), 1.5):
                with self.subTest(field=field, value=value), self.assertRaises(e.EvaluationDenied):
                    self.aggregate([{**self.row, field: value}])
        for field in ("cost_microusd", "policy_tokens"):
            self.assertFalse(self.aggregate([{**self.row, field: 0}])["comparable_synthetic"])

    def test_unsafe_failed_retry_blocks_otherwise_correct_candidate(self):
        for guard in e.SAFETY_GUARDS:
            failed = observation(self.slot, status="failed", result=None,
                                 safety={**self.row["safety"], guard: False})
            answer = self.aggregate([failed, observation(self.slot, attempt=1)])
            self.assertFalse(answer["safety_ok"])
            self.assertFalse(answer["comparable_synthetic"])

    def test_timeout_overrun_is_not_comparable(self):
        answer = self.aggregate([{**self.row, "duration_ms": 5001}])
        self.assertFalse(answer["within_deadline"])
        self.assertFalse(answer["comparable_synthetic"])

    def test_matching_arms_requires_exact_source_and_frozen_lineage(self):
        baseline = observation(slot(self.config, "baseline"))
        self.assertEqual(len(e.match_arms([baseline], [self.row])), 1)
        for field, value in (("model_digest", "f" * 64), ("snapshot_digest", "f" * 64),
                             ("candidate_commit", "d" * 40), ("seed", 9), ("attempt", 1)):
            with self.subTest(field=field), self.assertRaises(e.EvaluationDenied):
                e.match_arms([baseline], [{**self.row, field: value}])

    def test_wrong_frozen_config_or_arm_in_observation_rejected(self):
        for field in e.DIGEST_FIELDS:
            with self.subTest(field=field), self.assertRaises(e.EvaluationDenied):
                self.aggregate([{**self.row, field: "f" * 64}])
        with self.assertRaises(e.EvaluationDenied): self.aggregate([observation(slot(self.config, "baseline"))])

    def test_heldout_and_ood_attempts_are_capped_including_retries(self):
        heldout = slot(self.config, task_id="b")
        rows = [observation(heldout, attempt=i) for i in range(3)]
        with self.assertRaisesRegex(e.EvaluationDenied, "attempt cap"):
            self.aggregate(rows, [heldout])
        with self.assertRaises(e.EvaluationDenied):
            e.enforce_heldout_attempt_cap([{"split_id": "ood"}] * 3, cap=2)

    def test_hostile_nonjson_and_deep_input_denied(self):
        class Hostile(dict):
            def items(self): raise AssertionError("must not call")
        with self.assertRaises(e.EvaluationDenied): e.import_observation(Hostile(), synthetic=True)
        with self.assertRaises(e.EvaluationDenied): e.public_task_packet(Hostile())
        with self.assertRaises(e.EvaluationDenied): e.grade_factual_task(Hostile(), result())
        deep = {}; current = deep
        for _ in range(15): current["x"] = {}; current = current["x"]
        with self.assertRaises(e.EvaluationDenied): e._data(deep)

    def test_terminal_failure_and_malformed_cap_history_are_not_accepted(self):
        answer = self.aggregate([observation(self.slot, status="failed", result=None)])
        self.assertEqual(answer["score"], 0)
        self.assertFalse(answer["comparable_synthetic"])
        for history in ([{}], [None], {}):
            with self.assertRaises(e.EvaluationDenied): e.enforce_heldout_attempt_cap(history, cap=1)


if __name__ == "__main__": unittest.main()
