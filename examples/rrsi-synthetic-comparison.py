import copy
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] /
                       "plugins/fable5-codex/experiments/rrsi"))
import evaluator as evaluation

source = "export const enabled = false;"
line_ref = {"path": "worker.js", "line": 1,
            "content_digest": evaluation.digest(source.encode())}
tasks = []
for name, split, prompt in [
    ("a", "evolve", "Check the worker enabled state."),
    ("b", "heldout", "Determine whether dispatch waits for confirmation."),
    ("c", "ood", "Which evidence establishes production activation?"),
]:
    tasks.append({"id": f"task-{name}", "repository": f"repo-{name}", "family": f"family-{name}",
                  "split": split, "prompt": prompt, "sources": {"worker.js": source + "\n"},
                  "assertions": [{"id": "enabled", "path": "worker.enabled",
                                  "equals": False, "evidence": line_ref}]})
arguments = {"suite_id": "synthetic-demo", "tasks": tasks, "weights": {"uniform": 1},
             "model": {"provider": "synthetic", "name": "fixture", "effort": "low"},
             "runtime": {"workers": 1, "timeout_ms": 5000, "max_retries": 0, "heldout_attempt_cap": 2},
             "split": {"tasks": {"evolve": ["task-a"], "heldout": ["task-b"], "ood": ["task-c"]}}}
config = evaluation.freeze_evaluation_config(**arguments)


def slots(arm):
    return [evaluation.expected_slot(config, task_id="task-a", experiment_id="demo",
            baseline_commit="a" * 40, candidate_commit="b" * 40, arm=arm,
            trial_id=f"trial-{trial}", seed=trial, snapshot_digest="c" * 64) for trial in range(1, 4)]


def observe(slot, status="completed", cost=100):
    result = ({"facts": {"worker": {"enabled": False}}, "evidence": {"worker": {"enabled": line_ref}}}
              if status == "completed" else None)
    return {**slot, "attempt": 0, "status": status, "terminal": status in ("completed", "failed"),
            "result": result, "output_digest": evaluation.digest(result), "cost_microusd": cost,
            "policy_tokens": 20, "duration_ms": 50, "safety": {key: True for key in evaluation.SAFETY_GUARDS}}


def denied(call):
    try:
        call()
    except evaluation.EvaluationDenied:
        return
    raise AssertionError("expected EvaluationDenied")


baseline_slots, candidate_slots = slots("baseline"), slots("candidate")
baseline_rows = [observe(slot) for slot in baseline_slots]
candidate_rows = [observe(candidate_slots[0]), observe(candidate_slots[1], "timeout"), observe(candidate_slots[2])]
assert len(evaluation.match_arms(baseline_rows, candidate_rows)) == 3
baseline = evaluation.aggregate_results(observations=baseline_rows, expected_slots=baseline_slots, config=config, synthetic=True)
candidate = evaluation.aggregate_results(observations=candidate_rows, expected_slots=candidate_slots, config=config, synthetic=True)
assert baseline["score"] == 1 and baseline["expected_trials"] == 3
assert candidate["score"] == 2 / 3 and candidate["missing_trials"] == 1 and not candidate["comparable_synthetic"]
partial = evaluation.aggregate_results(observations=candidate_rows[:1], expected_slots=candidate_slots, config=config, synthetic=True)
assert partial["score"] == 1 / 3 and partial["expected_trials"] == 3 and partial["missing_trials"] == 2
for field in ("repository", "family", "prompt"):
    leaked = copy.deepcopy(arguments)
    leaked["tasks"][1][field] = leaked["tasks"][0][field]
    denied(lambda: evaluation.freeze_evaluation_config(**leaked))
for field, value in [("seed", 99), ("model_digest", "d" * 64), ("runtime_digest", "d" * 64)]:
    mismatched = copy.deepcopy(candidate_rows)
    mismatched[0][field] = value
    denied(lambda: evaluation.match_arms(baseline_rows, mismatched))
denied(lambda: evaluation.public_task_packet(tasks[1]))
denied(lambda: evaluation.public_task_packet(tasks[2]))
denied(lambda: evaluation.enforce_heldout_attempt_cap([{"split_id": "heldout"}] * 3, cap=2))
zero_tokens = observe(candidate_slots[0])
zero_tokens["policy_tokens"] = 0
for row in [observe(candidate_slots[0], "unknown", cost=100), observe(candidate_slots[0], cost=0), zero_tokens]:
    report = evaluation.aggregate_results(observations=[row], expected_slots=[candidate_slots[0]], config=config, synthetic=True)
    assert not report["costs_known_positive"] and not report["comparable_synthetic"]
unsafe = observe(candidate_slots[0])
unsafe["safety"]["authority_ok"] = False
guarded = evaluation.aggregate_results(observations=[unsafe], expected_slots=[candidate_slots[0]], config=config, synthetic=True)
assert guarded["score"] == 0 and not guarded["comparable_synthetic"]
for report in [baseline, candidate, partial, guarded]:
    assert report["accepted"] is False and report["promotion_allowed"] is False
denied(lambda: evaluation.import_observation(baseline_rows[0], synthetic=False))
print(json.dumps({"synthetic": True, "effectivenessMeasured": False, "trustedHostImport": False,
                  "baseline": baseline, "candidate": candidate, "missingCase": partial,
                  "leakageAndMatchingRejectionsExercised": True}))
