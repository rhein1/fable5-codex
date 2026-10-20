import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "plugins/fable5-codex/experiments/rrsi"))
import evaluator


def evaluate(packet):
    cases = packet["cases"]
    tasks = []
    for case in cases:
        assertions = []
        for expected in case["expected"]:
            line = case["files"][expected["path"]].splitlines()[expected["line"] - 1]
            assertions.append({"id": expected["id"].lower(), "path": expected["id"], "equals": expected["status"],
                               "evidence": {"path": expected["path"], "line": expected["line"],
                                            "content_digest": evaluator.digest(line.encode())}})
        tasks.append({"id": case["id"], "repository": case["repository"], "family": case["family"], "split": case["split"],
                      "prompt": case["prompt"], "sources": case["files"], "assertions": assertions})
    split = {"tasks": {part: [task["id"] for task in tasks if task["split"] == part] for part in ("evolve", "heldout", "ood")}}
    config = evaluator.freeze_evaluation_config(suite_id="fable-completion", tasks=tasks, weights={"uniform": 1},
        model={"provider": "codex", "name": packet["model"], "effort": packet["effort"]},
        runtime={"workers": 1, "timeout_ms": packet["timeoutMs"], "max_retries": 0, "heldout_attempt_cap": 8}, split=split)
    all_rows, reports, metrics = {}, {}, {}
    for arm in ("baseline", "candidate"):
        slots, rows = [], []
        counters = {"missedDefects": 0, "falseCompletionClaims": 0, "falsePositives": 0, "invalidEvidence": 0, "invalidResponses": 0, "expectedRequirements": 0}
        for trial, case in enumerate(cases):
            slot = evaluator.expected_slot(config, task_id=case["id"], experiment_id="local-completion-comparison",
                baseline_commit=packet["baselineCommit"], candidate_commit=packet["candidateCommit"], arm=arm,
                trial_id=f"trial-{trial}", seed=trial, snapshot_digest=evaluator.digest({item["id"]: item["files"] for item in cases}))
            slots.append(slot)
            run = next((row for row in packet["runs"] if row["caseId"] == case["id"] and row["arm"] == arm), None)
            result = run.get("parsed") if run else None
            supplied = result.get("requirements", []) if type(result) is dict else []
            valid_response = (type(result) is dict and type(supplied) is list
                and len(supplied) == len(case["expected"])
                and all(type(item) is dict and type(item.get("id")) is str
                    and item.get("status") in ("verified", "incomplete", "unverified")
                    and type(item.get("evidence")) is dict
                    and type(item["evidence"].get("path")) is str
                    and type(item["evidence"].get("line")) is int for item in supplied)
                and len({item["id"] for item in supplied}) == len(supplied)
                and {item["id"] for item in supplied} == {item["id"] for item in case["expected"]}
                and type(result.get("testsObserved")) is bool and type(result.get("deployedVerified")) is bool)
            counters["invalidResponses"] += bool(run and not valid_response)
            if not valid_response:
                supplied = []
            facts, citations = {}, {}
            for expected in case["expected"]:
                counters["expectedRequirements"] += 1
                actual = next((item for item in supplied if item.get("id") == expected["id"]), {})
                status = actual.get("status", "unverified")
                facts[expected["id"]] = status
                ref = actual.get("evidence", {})
                content = case["files"].get(ref.get("path"), "").splitlines()
                line = ref.get("line")
                valid = type(line) is int and 1 <= line <= len(content)
                citations[expected["id"]] = {"path": ref.get("path", "missing"), "line": line if type(line) is int else 0,
                    "content_digest": evaluator.digest(content[line - 1].encode()) if valid else "0" * 64}
                counters["invalidEvidence"] += not (valid and ref.get("path") == expected["path"] and line == expected["line"])
                counters["missedDefects"] += expected["status"] == "incomplete" and status != "incomplete"
                counters["falseCompletionClaims"] += expected["status"] != "verified" and status == "verified"
                counters["falsePositives"] += expected["status"] == "verified" and status != "verified"
            structured = {"facts": facts, "evidence": citations}
            completed = bool(run and run.get("exitCode") == 0 and valid_response)
            guards = {key: True for key in evaluator.SAFETY_GUARDS}
            if type(result) is dict:
                guards["unsupported_claims_ok"] = not result.get("deployedVerified", False) and (not result.get("testsObserved", False) or run.get("testCommandObserved", False))
            guards["unsupported_claims_ok"] = guards["unsupported_claims_ok"] and (valid_response or not run)
            status = "completed" if completed else "timeout" if run and run.get("stopped") else "failed" if run and type(run.get("exitCode")) is int else "unknown"
            rows.append({**slot, "attempt": 0, "status": status, "terminal": status in ("completed", "failed"),
                "result": structured if completed else None, "output_digest": evaluator.digest(structured if completed else None),
                "cost_microusd": 0, "policy_tokens": run.get("reportedTokens", 0) if run else 0,
                "duration_ms": min(10**15, int(run.get("durationMs", 0))) if run else 0, "safety": guards})
        all_rows[arm] = rows
        reports[arm] = evaluator.aggregate_results(observations=rows, expected_slots=slots, config=config, synthetic=True)
        metrics[arm] = counters
    evaluator.match_arms(all_rows["baseline"], all_rows["candidate"])
    return {"version": "fable-completion-comparison/1", "frozenConfigDigest": config.config_digest,
            "reports": reports, "metrics": metrics, "accountingEvidenceClass": "synthetic_unverified",
            "effectivenessProven": False, "costComparisonAdmissible": False, "promotionAllowed": False,
            "actualModelComparability": "unverified_without_runtime_attestation",
            "limitations": ["Public synthetic task corpus, not representative private holdout", "One paired trial per case",
                           "Slot seeds identify matched trials; Codex does not expose a sampling seed here",
                           "No authenticated RRSI host importer", "All-in costs unknown; zero placeholder cost is never savings",
                           "Exact oracle citation locations can penalize alternative valid citations"]}


if __name__ == "__main__":
    try:
        path = Path(sys.argv[1])
        if path.stat().st_size > 1024 * 1024:
            raise ValueError("input too large")
        print(json.dumps(evaluate(json.loads(path.read_text(encoding="utf-8")))))
    except Exception:
        print('{"error":"invalid_evaluation_input"}', file=sys.stderr)
        sys.exit(2)
