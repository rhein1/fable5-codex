"""Adversarial offline contract tests for TraceSession."""
import copy
from dataclasses import replace
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "plugins/fable5-codex/experiments/rrsi"
sys.path.insert(0, str(BASE))

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); sys.modules[name] = module
    spec.loader.exec_module(module); return module

e = load("evaluator", BASE / "evaluator.py")
g = load("trace_session_guidance", BASE / "trace_guidance.py")

def task(identifier, split):
    source = "export const enabled = false;"
    prompts = {"a": "Check worker startup state.", "b": "Determine asynchronous dispatch gating.", "c": "Audit evidence for activation claims."}
    return {"id": identifier, "repository": "repo-" + identifier, "family": "family-" + identifier,
            "split": split, "prompt": prompts[identifier], "sources": {"worker.js": source + "\n"},
            "assertions": [{"id": "enabled", "path": "worker.enabled", "equals": False,
                            "evidence": {"path": "worker.js", "line": 1, "content_digest": e.digest(source.encode())}}]}

def config(**changes):
    args = {"suite_id": "trace-session-suite", "tasks": [task("a", "evolve"), task("b", "heldout"), task("c", "ood")],
            "weights": {"uniform": 1}, "model": {"provider": "synthetic", "name": "fixture", "effort": "low"},
            "runtime": {"workers": 1, "timeout_ms": 5000, "max_retries": 1, "heldout_attempt_cap": 4},
            "split": {"tasks": {"evolve": ["a"], "heldout": ["b"], "ood": ["c"]}}}
    args.update(changes); return e.freeze_evaluation_config(**args)

def raw(value): return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
def traces(*failures): return raw([{"task_id": "a", "failure": f, "output_digest": "1" * 64} for f in failures])
def result(correct=True):
    return {"facts": {"worker": {"enabled": not correct}}, "evidence": {"worker": {"enabled": {
        "path": "worker.js", "line": 1, "content_digest": e.digest(b"export const enabled = false;")}}}}

def row(session, task_id, attempt, arm="baseline", status="completed", correct=True, **changes):
    digest = session.baseline_digest if arm == "baseline" else session._candidate_for_test
    value = {"task_id": task_id, "attempt": attempt, "input_digest": digest, "status": status,
             "result": result(correct) if status == "completed" else None,
             "safety": {key: True for key in e.SAFETY_GUARDS},
             "estimated": {"tokens": 10, "cost_microusd": 10, "duration_ms": 1}}
    value.update(changes); return value

class TraceSessionTests(unittest.TestCase):
    def setUp(self):
        self.session = g.TraceSession(config(), baseline_commit="a" * 40, snapshot_digest="b" * 64,
                                      enabled=True, attempts_per_task=2, token_budget=10000,
                                      cost_budget_microusd=10000, wall_ms=1000)
        self.candidate = self.session.propose(traces("missing-evidence"))
        self.session._candidate_for_test = self.candidate["candidate_digest"]

    def request(self, split="evolve", candidate=None, baseline_rows=None, policy_rows=None, attempts=2):
        return raw({"binding_digest": self.session.binding_digest, "candidate_digest": candidate or self.candidate["candidate_digest"],
                    "split": split, "attempts_per_task": attempts,
                    "lanes": {"baseline": baseline_rows if baseline_rows is not None else [row(self.session, "a", i) for i in range(attempts)],
                               "policy": policy_rows if policy_rows is not None else [row(self.session, "a", i, "policy") for i in range(attempts)]}})

    def test_disabled_is_default_off(self):
        disabled = g.TraceSession(config(), baseline_commit="a" * 40, snapshot_digest="b" * 64)
        self.assertEqual(disabled.propose(traces("missing-evidence"))["status"], "disabled")
        self.assertEqual(disabled.replay(b"{}")["status"], "disabled")
        with self.assertRaises(g.GuidanceDenied): disabled.binding_digest
        with self.assertRaises(g.GuidanceDenied): disabled.baseline_digest
        with self.assertRaises(g.GuidanceDenied): disabled.render("a" * 64)
        self.assertTrue(g.verify_archive(disabled.export_archive(), expected_tip=g.ZERO))

    def test_binding_baseline_and_snapshot_are_frozen(self):
        self.assertEqual(len(self.session.binding_digest), 64)
        changed = g.TraceSession(config(), baseline_commit="a" * 39 + "c", snapshot_digest="b" * 64, enabled=True)
        self.assertNotEqual(changed.binding_digest, self.session.binding_digest)
        with self.assertRaises(g.GuidanceDenied): self.session.replay(raw({"binding_digest": "c" * 64, "candidate_digest": self.candidate["candidate_digest"], "split": "evolve", "attempts_per_task": 2, "lanes": {"baseline": [], "policy": []}}))

    def test_config_rebuilt_and_provider_must_be_synthetic(self):
        altered = config(model={"provider": "fixture", "name": "fixture", "effort": "low"})
        with self.assertRaises(g.GuidanceDenied): g.TraceSession(altered, baseline_commit="a" * 40, snapshot_digest="b" * 64, enabled=True)
        with self.assertRaises(g.GuidanceDenied):
            g.TraceSession(replace(config(), config_digest="d" * 64), baseline_commit="a" * 40,
                           snapshot_digest="b" * 64, enabled=True)

    def test_trace_proposal_maps_finite_dev_failures_to_options(self):
        candidate = self.session.propose(traces("unsupported-claim", "missed-boundary"))
        self.assertEqual(candidate["binding_digest"], self.session.binding_digest)
        self.assertIn("Try to refute", " ".join(self.session.render(candidate["candidate_digest"])[0]))
        self.assertTrue(all(isinstance(ref, str) and len(ref) == 64 for ref in candidate["trace_refs"]))

    def test_malformed_or_unknown_failure_and_heldout_trace_denied(self):
        for trace in ([{"task_id": "a", "failure": "free prose", "output_digest": "1" * 64}],
                      [{"task_id": "b", "failure": "missing-evidence", "output_digest": "1" * 64}],
                      [{"task_id": "a", "failure": "missing-evidence", "output_digest": "bad"}]):
            with self.subTest(trace=trace), self.assertRaises(g.GuidanceDenied): self.session.propose(raw(trace))

    def test_raw_trace_fields_and_duplicate_fields_denied(self):
        with self.assertRaises(g.GuidanceDenied): self.session.propose(raw([{"task_id": "a", "failure": "missing-evidence", "output_digest": "1" * 64, "prompt": "secret"}]))
        duplicate = b'[{"task_id":"a","task_id":"a","failure":"missing-evidence","output_digest":"' + b"1" * 64 + b'"}]'
        with self.assertRaises(g.GuidanceDenied): self.session.propose(duplicate)

    def test_proposal_bounds_and_depth_parent(self):
        with self.assertRaises(g.GuidanceDenied): self.session.propose(raw([]))
        with self.assertRaises(g.GuidanceDenied): self.session.propose(raw([{"task_id": "a", "failure": "missing-evidence", "output_digest": "1" * 64}] * 21))
        with self.assertRaises(g.GuidanceDenied): self.session.propose(traces("missing-evidence"), parent_digest="2" * 64)
        child = self.session.propose(traces("unsupported-claim"), parent_digest=self.candidate["candidate_digest"])
        self.assertEqual(len(child["layers"]), 2)
        with self.assertRaises(g.GuidanceDenied): self.session.propose(traces("missed-boundary"), parent_digest=child["candidate_digest"])

    def test_candidate_render_is_digest_bound(self):
        self.assertEqual(len(self.session.render(self.candidate["candidate_digest"])), 1)
        with self.assertRaises(g.GuidanceDenied): self.session.render("0" * 64)
        self.session._candidates["3" * 64] = copy.deepcopy(self.candidate)
        with self.assertRaises(g.GuidanceDenied): self.session.render("3" * 64)

    def test_replay_strict_binding_and_legitimate_fixture(self):
        receipt = self.session.replay(self.request())
        self.assertEqual(receipt["kind"], "replay")
        self.assertEqual(receipt["body"]["qualification"], "fixture_only")
        self.assertEqual(receipt["body"]["actual"]["provider_tokens"], 0)
        self.assertEqual(receipt["body"]["actual"]["provider_cost_microusd"], 0)
        self.assertFalse(receipt["body"]["effectiveness_measured"])

    def test_replay_binding_candidate_split_and_attempts_denied(self):
        for changes in ({"binding_digest": "c" * 64}, {"candidate_digest": "d" * 64}, {"split": "ood"}):
            request = json.loads(self.request()); request.update(changes)
            with self.subTest(changes=changes), self.assertRaises(g.GuidanceDenied): self.session.replay(raw(request))

    def test_duplicate_missing_and_unknown_attempt_rows_denied(self):
        with self.assertRaises(g.GuidanceDenied): self.session.replay(self.request(baseline_rows=[row(self.session, "a", 0)] * 2))
        receipt = self.session.replay(self.request(baseline_rows=[row(self.session, "a", 0)]))
        self.assertFalse(receipt["body"]["comparable_fixture"])
        with self.assertRaises(g.GuidanceDenied): self.session.replay(self.request(baseline_rows=[row(self.session, "x", i) for i in range(2)]))

    def test_unsafe_unknown_zero_and_bad_estimates_invalidate(self):
        for changes in ({"status": "unknown"}, {"estimated": {"tokens": 0, "cost_microusd": 10, "duration_ms": 1}},
                        {"safety": {key: False for key in e.SAFETY_GUARDS}}):
            receipt = self.session.replay(self.request(baseline_rows=[row(self.session, "a", 0, **changes), row(self.session, "a", 1)]))
            self.assertFalse(receipt["body"]["comparable_fixture"])

    def test_policy_input_hash_is_candidate_not_baseline(self):
        bad = [row(self.session, "a", i, "policy") for i in range(2)]; bad[0]["input_digest"] = self.session.baseline_digest
        with self.assertRaises(g.GuidanceDenied): self.session.replay(self.request(policy_rows=bad))

    def test_heldout_seals_policy_and_cumulative_cap(self):
        request = {"binding_digest": self.session.binding_digest, "candidate_digest": self.candidate["candidate_digest"], "split": "heldout", "attempts_per_task": 2, "lanes": {"baseline": [], "policy": []}}
        first = self.session.replay(raw(request)); self.assertEqual(first["body"]["status"], "completed")
        with self.assertRaises(g.GuidanceDenied): self.session.propose(traces("unknown-cost"))
        with self.assertRaises(g.GuidanceDenied): self.session.replay(raw({**request, "candidate_digest": "f" * 64}))

    def test_heldout_attempt_cap_is_cumulative(self):
        small = g.TraceSession(config(runtime={"workers": 1, "timeout_ms": 5000, "max_retries": 1, "heldout_attempt_cap": 2}), baseline_commit="a" * 40, snapshot_digest="b" * 64, enabled=True, attempts_per_task=1)
        candidate = small.propose(traces("missing-evidence")); request = {"binding_digest": small.binding_digest, "candidate_digest": candidate["candidate_digest"], "split": "heldout", "attempts_per_task": 1, "lanes": {"baseline": [], "policy": []}}
        small.replay(raw(request))
        with self.assertRaises(g.GuidanceDenied): small.replay(raw(request))

    def test_cancel_is_permanent_and_no_winner(self):
        self.session.cancel(); receipt = self.session.replay(self.request())
        self.assertEqual(receipt["body"]["status"], "cancelled"); self.assertFalse(receipt["body"]["comparable_fixture"]); self.assertNotIn("winner", receipt["body"])
        with self.assertRaises(g.GuidanceDenied): self.session.replay(b"x" * (g.MAX_BYTES + 1))

    def test_deadline_monotonic_mid_grade(self):
        with patch.object(g.time, "monotonic", side_effect=[0.0, 0.0, 2.0, 2.0]): receipt = self.session.replay(self.request())
        self.assertEqual(receipt["body"]["status"], "timeout"); self.assertFalse(receipt["body"]["comparable_fixture"])

    def test_budget_exceeded_is_not_comparable(self):
        low = g.TraceSession(config(), baseline_commit="a" * 40, snapshot_digest="b" * 64, enabled=True, token_budget=1, cost_budget_microusd=1)
        candidate = low.propose(traces("missing-evidence")); low._candidate_for_test = candidate["candidate_digest"]
        request = {"binding_digest": low.binding_digest, "candidate_digest": candidate["candidate_digest"], "split": "evolve", "attempts_per_task": 2, "lanes": {"baseline": [row(low, "a", i) for i in range(2)], "policy": [row(low, "a", i, "policy") for i in range(2)]}}
        self.assertFalse(low.replay(raw(request))["body"]["comparable_fixture"])

    def test_archive_export_verifies_against_external_tip(self):
        self.session.replay(self.request()); archive = self.session.export_archive()
        self.assertTrue(g.verify_archive(archive, expected_tip=self.session.archive_tip))
        with self.assertRaises(g.GuidanceDenied): g.verify_archive(archive, expected_tip="0" * 64)

    def test_archive_old_record_tamper_and_rehashed_semantics_denied(self):
        self.session.replay(self.request()); archive = json.loads(self.session.export_archive()); archive["records"][0]["body"]["baseline_commit"] = "secrets"
        with self.assertRaises(g.GuidanceDenied): g.verify_archive(raw(archive), expected_tip=self.session.archive_tip)
        archive = json.loads(self.session.export_archive()); archive["records"][0]["digest"] = "f" * 64; archive["tip"] = "f" * 64
        with self.assertRaises(g.GuidanceDenied): g.verify_archive(raw(archive), expected_tip="f" * 64)

    def test_archive_records_are_bounded_and_authority_fixed(self):
        record = json.loads(self.session.export_archive())["records"][0]
        self.assertEqual(record["authority_boundary"], g.BOUNDARY); self.assertFalse(record["accepted"]); self.assertFalse(record["promotion_allowed"])
        self.assertTrue(g.verify_archive(raw({"schema": g.SCHEMA, "records": [], "tip": g.ZERO}), expected_tip=g.ZERO))

    def test_unknown_request_fields_and_oversized_json_denied(self):
        request = json.loads(self.request()); request["private_payload"] = "x"
        with self.assertRaises(g.GuidanceDenied): self.session.replay(raw(request))
        with self.assertRaises(g.GuidanceDenied): self.session.replay(b"{" + b"x" * 262144 + b"}")

    def test_grader_and_vocabulary_drift_refuse_work(self):
        with patch.object(g.Path, "read_bytes", return_value=b"changed source"):
            with self.assertRaises(g.GuidanceDenied): self.session.replay(self.request())
        with patch.dict(g.OPTIONS["strategy"], {"seek-refutation": "new instruction"}):
            with self.assertRaises(g.GuidanceDenied): self.session.render(self.candidate["candidate_digest"])

    def test_json_depth_nodes_strings_numbers_and_unknown_authority_are_bounded(self):
        nested = []
        for _ in range(14): nested = [nested]
        for value in (nested, [[0] * 40] * 220, "x" * 2049, 10**13, float("nan"), {"x" * 129: 1}):
            with self.subTest(kind=type(value).__name__), self.assertRaises(g.GuidanceDenied):
                self.session.propose(raw(value))
        request = json.loads(self.request())
        request["lanes"]["policy"][0]["authority"] = {"spend": True}
        with self.assertRaises(g.GuidanceDenied): self.session.replay(raw(request))

    def test_attempt_count_and_integer_estimates_cannot_be_forged(self):
        with self.assertRaises(g.GuidanceDenied): self.session.replay(self.request(attempts=3))
        for field, value in (("attempt", True), ("attempt", 2)):
            rows = [row(self.session, "a", i) for i in range(2)]; rows[0][field] = value
            with self.assertRaises(g.GuidanceDenied): self.session.replay(self.request(baseline_rows=rows))
        for value in (True, 1.5, -1):
            rows = [row(self.session, "a", i) for i in range(2)]
            rows[0]["estimated"]["tokens"] = value
            with self.assertRaises(g.GuidanceDenied): self.session.replay(self.request(baseline_rows=rows))

    def test_fixed_policy_flat_last_and_oracle_max_are_distinct(self):
        baseline = [row(self.session, "a", 0, correct=True), row(self.session, "a", 1, correct=False)]
        policy = [row(self.session, "a", 0, "policy", correct=True), row(self.session, "a", 1, "policy", correct=False)]
        body = self.session.replay(self.request(baseline_rows=baseline, policy_rows=policy))["body"]
        scores = body["results"][0]
        self.assertEqual((scores["baseline_first"], scores["flat_retry"], scores["flat_best_of_n_oracle"], scores["single_policy"]), (1, 0, 1, 0))
        self.assertEqual(body["qualification"], "regressed")
        self.assertEqual(body["regressions"], [e.digest("a")])
        self.assertEqual(body["estimated_attempt_totals"]["baseline"]["cost_microusd"], 20)
        self.assertEqual(body["estimated_attempt_totals"]["policy"]["tokens"],
                         20 + 2 * self.candidate["context_token_upper_bound"])

    def test_heldout_evaluation_rejects_known_alternative_policy(self):
        alternative = self.session.propose(traces("unknown-cost"))
        heldout = self.request(split="heldout", baseline_rows=[row(self.session, "b", i) for i in range(2)],
                               policy_rows=[row(self.session, "b", i, "policy") for i in range(2)])
        self.assertTrue(self.session.replay(heldout)["body"]["comparable_fixture"])
        request = json.loads(heldout); request["candidate_digest"] = alternative["candidate_digest"]
        with self.assertRaisesRegex(g.GuidanceDenied, "policy is already fixed"):
            self.session.replay(raw(request))

    def test_cancel_during_grading_is_terminal(self):
        original = e.grade_factual_task
        def stop_after_first(*args):
            result = original(*args); self.session.cancel(); return result
        with patch.object(e, "grade_factual_task", side_effect=stop_after_first):
            body = self.session.replay(self.request())["body"]
        self.assertEqual(body["status"], "cancelled")
        self.assertEqual(body["qualification"], "incomplete")
        self.assertFalse(body["comparable_fixture"])
        self.assertEqual(self.session.propose(traces("unknown-cost"))["status"], "cancelled")

    def test_candidate_export_copies_do_not_mutate_future_work(self):
        exported = self.session.propose(traces("missing-evidence"))
        exported["layers"][0]["strategy"] = ["run-shell"]
        rendered = self.session.render(self.candidate["candidate_digest"])
        self.assertNotIn("run-shell", str(rendered))
        archive = json.loads(self.session.export_archive()); archive["records"].clear()
        self.assertEqual(len(json.loads(self.session.export_archive())["records"]), 2)

    def test_authority_flags_cannot_be_rehashed_into_archive(self):
        archive = json.loads(self.session.export_archive())
        last = archive["records"][-1]; last["accepted"] = True
        last["digest"] = e.digest({key: value for key, value in last.items() if key != "digest"})
        archive["tip"] = last["digest"]
        with self.assertRaises(g.GuidanceDenied):
            g.verify_archive(raw(archive), expected_tip=archive["tip"])

    def test_numeric_bool_substitutions_cannot_retain_original_tip(self):
        original = self.session.export_archive()
        for field, value in (("accepted", 0), ("promotion_allowed", 0),
                             ("sequence", True), ("sequence", 1.0)):
            changed = json.loads(original)
            changed["records"][-1][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(g.GuidanceDenied):
                g.verify_archive(raw(changed), expected_tip=self.session.archive_tip)
        changed = json.loads(original)
        changed["records"][-1]["authority_boundary"]["execution"] = 0
        with self.assertRaises(g.GuidanceDenied):
            g.verify_archive(raw(changed), expected_tip=self.session.archive_tip)
        # Whitespace and object-key order do not change canonical data.
        self.assertTrue(g.verify_archive(json.dumps(json.loads(original), indent=2).encode(),
                                         expected_tip=self.session.archive_tip))

    def test_rehashing_mistyped_envelope_cannot_make_it_valid(self):
        for field, value in (("accepted", 0), ("promotion_allowed", 0), ("sequence", True), ("sequence", 1.0)):
            changed = json.loads(self.session.export_archive())
            record = changed["records"][-1]; record[field] = value
            record["digest"] = e.digest({key: item for key, item in record.items() if key != "digest"})
            changed["tip"] = record["digest"]
            with self.subTest(field=field, value=value), self.assertRaises(g.GuidanceDenied):
                g.verify_archive(raw(changed), expected_tip=changed["tip"])

    def test_nested_numeric_value_changes_are_bound_to_received_record_digest(self):
        archive = json.loads(self.session.export_archive())
        record = archive["records"][-1]
        record["body"]["context_token_upper_bound"] = float(record["body"]["context_token_upper_bound"])
        with self.assertRaises(g.GuidanceDenied):
            g.verify_archive(raw(archive), expected_tip=self.session.archive_tip)

    def test_archive_capacity_refuses_further_work(self):
        for _ in range(g.MAX_RECORDS - 2): self.session.replay(self.request())
        tip = self.session.archive_tip
        with self.assertRaises(g.GuidanceDenied): self.session.replay(self.request())
        self.assertEqual(self.session.archive_tip, tip)
        self.assertTrue(g.verify_archive(self.session.export_archive(), expected_tip=tip))

    def test_reproduction_preserves_scores_binding_and_estimates(self):
        left = self.session.replay(self.request())["body"]
        self.setUp()
        right = self.session.replay(self.request())["body"]
        left["actual"].pop("offline_elapsed_ms"); right["actual"].pop("offline_elapsed_ms")
        self.assertEqual(left, right)

if __name__ == "__main__": unittest.main()
