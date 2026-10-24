"""Small offline TraceSession demonstration; no provider or execution."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "plugins/fable5-codex/experiments/rrsi"
sys.path.insert(0, str(BASE))

import evaluator as e
import trace_guidance as g

source = "export const enabled = false;"
line = {"path": "worker.js", "line": 1, "content_digest": e.digest(source.encode())}
tasks = [{"id": "evolve-a", "repository": "repo-a", "family": "family-a", "split": "evolve",
          "prompt": "Check worker startup state.", "sources": {"worker.js": source + "\n"},
          "assertions": [{"id": "enabled", "path": "worker.enabled", "equals": False, "evidence": line}]},
         {"id": "heldout-b", "repository": "repo-b", "family": "family-b", "split": "heldout",
          "prompt": "Determine dispatch gating.", "sources": {"worker.js": source + "\n"},
          "assertions": [{"id": "enabled", "path": "worker.enabled", "equals": False, "evidence": line}]},
         {"id": "ood-c", "repository": "repo-c", "family": "family-c", "split": "ood",
          "prompt": "Audit activation evidence.", "sources": {"worker.js": source + "\n"},
          "assertions": [{"id": "enabled", "path": "worker.enabled", "equals": False, "evidence": line}]}]
config = e.freeze_evaluation_config(
    suite_id="trace-fixture-demo", tasks=tasks, weights={"uniform": 1},
    model={"provider": "synthetic", "name": "fixture", "effort": "low"},
    runtime={"workers": 1, "timeout_ms": 5000, "max_retries": 1, "heldout_attempt_cap": 4},
    split={"tasks": {"evolve": ["evolve-a"], "heldout": ["heldout-b"], "ood": ["ood-c"]}})

# Synthetic binding placeholders, not claims about reviewed Git source.
disabled = g.TraceSession(config, baseline_commit="a" * 40, snapshot_digest="b" * 64)
assert disabled.propose(b"[]")["status"] == "disabled"
session = g.TraceSession(config, baseline_commit="a" * 40, snapshot_digest="b" * 64, enabled=True)
candidate = session.propose(g.encode([{"task_id": "evolve-a", "failure": "missing-evidence",
                                       "output_digest": e.digest("synthetic failure")}]))


def attempt(arm, number, correct):
    # Prewritten observations exercise replay accounting, not a model's response
    # to guidance. Neither their scores nor their costs measure real efficacy.
    return {"task_id": "heldout-b", "attempt": number,
            "input_digest": session.baseline_digest if arm == "baseline" else candidate["candidate_digest"],
            "status": "completed", "result": {"facts": {"worker": {"enabled": not correct}},
                                                  "evidence": {"worker": {"enabled": line}}},
            "safety": {key: True for key in e.SAFETY_GUARDS},
            "estimated": {"tokens": 20, "cost_microusd": 100, "duration_ms": 50}}


receipt = session.replay(g.encode({
    "binding_digest": session.binding_digest, "candidate_digest": candidate["candidate_digest"],
    "split": "heldout", "attempts_per_task": 2,
    "lanes": {"baseline": [attempt("baseline", 0, False), attempt("baseline", 1, True)],
              "policy": [attempt("policy", 0, True), attempt("policy", 1, True)]}}))
assert receipt["body"]["comparable_fixture"] is True
assert receipt["accepted"] is False and receipt["promotion_allowed"] is False
assert g.verify_archive(session.export_archive(), expected_tip=session.archive_tip)
print(json.dumps({"default_off_verified": True, "synthetic": True,
                  "effectiveness_measured": False, "provider_calls": 0,
                  "guidance": session.render(candidate["candidate_digest"]),
                  "fixture_results": receipt["body"]["results"],
                  "estimated": receipt["body"]["estimated_attempt_totals"],
                  "actual": receipt["body"]["actual"], "archive_tip": session.archive_tip}, sort_keys=True))
