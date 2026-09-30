"""Independent structured grading and synthetic replay; live imports are hard-off.

Host-owned suites include source excerpts and exact factual/evidence assertions.
This is an offline evaluator, not an authenticator, general semantic judge, or
RRSI selector. Every replay output remains unverified and cannot be accepted.
"""
from __future__ import annotations

from dataclasses import dataclass
import difflib
import hashlib
import json
from pathlib import Path
import re
from types import MappingProxyType
from typing import Mapping


class EvaluationDenied(ValueError):
    pass


SCHEMA = "fable-rrsi-evaluator-v1"
SAFETY_GUARDS = ("authority_ok", "privacy_ok", "evidence_fidelity_ok",
                 "unsupported_claims_ok", "critical_regressions_ok")
DIGEST_FIELDS = ("evaluator_digest", "config_digest", "task_digest", "model_digest",
                 "runtime_digest", "split_digest", "snapshot_digest")
SLOT_FIELDS = ("experiment_id", *DIGEST_FIELDS, "baseline_commit", "candidate_commit",
               "source_commit", "arm", "task_id", "split_id", "trial_id", "seed")
OBS_FIELDS = (*SLOT_FIELDS, "attempt", "status", "terminal", "output_digest", "result",
              "cost_microusd", "policy_tokens", "duration_ms", "safety")


def digest(value):
    raw = value if isinstance(value, bytes) else json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()
    return hashlib.sha256(raw).hexdigest()


def _data(value, depth=0, budget=None):
    """Copy bounded plain JSON without invoking user-defined Mapping methods."""
    budget = [0] if budget is None else budget
    budget[0] += 1
    if depth > 12 or budget[0] > 30000:
        raise EvaluationDenied("input too complex")
    if value is None or type(value) in (bool, int):
        return value
    if type(value) is str:
        if len(value) > 65536:
            raise EvaluationDenied("string too long")
        value.encode("utf-8")
        return value
    if type(value) is list:
        return [_data(v, depth + 1, budget) for v in value]
    if type(value) is dict and all(type(k) is str for k in value):
        return {k: _data(v, depth + 1, budget) for k, v in value.items()}
    raise EvaluationDenied("plain integer-valued JSON required")


def _freeze(value):
    if type(value) is dict:
        return MappingProxyType({k: _freeze(v) for k, v in value.items()})
    if type(value) is list:
        return tuple(_freeze(v) for v in value)
    return value


def _plain(value):
    if isinstance(value, Mapping):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, tuple):
        return [_plain(v) for v in value]
    return value


def _fields(value, names):
    if type(value) is not dict or set(value) != set(names):
        raise EvaluationDenied("invalid fields")


def _identifier(value):
    if type(value) is not str or re.fullmatch(r"[a-z0-9][a-z0-9._/-]{0,127}", value) is None:
        raise EvaluationDenied("invalid identifier")


def _hash(value, length=64):
    if type(value) is not str or re.fullmatch(r"[a-f0-9]{" + str(length) + "}", value) is None:
        raise EvaluationDenied("exact digest required")


def _integer(value, low=0, high=10**15):
    if type(value) is not int or not low <= value <= high:
        raise EvaluationDenied("bounded integer required")


def _task(task):
    _fields(task, ("id", "repository", "family", "split", "prompt", "sources", "assertions"))
    for field in ("id", "repository", "family"):
        _identifier(task[field])
    if task["split"] not in ("evolve", "heldout", "ood") or type(task["prompt"]) is not str or not task["prompt"].strip():
        raise EvaluationDenied("invalid task split or prompt")
    if type(task["sources"]) is not dict or not task["sources"]:
        raise EvaluationDenied("host source excerpts required")
    for path, content in task["sources"].items():
        if (not re.fullmatch(r"[A-Za-z0-9_/-]+(?:\.[A-Za-z0-9]+)?", path)
                or path.startswith("/") or ".." in path or type(content) is not str):
            raise EvaluationDenied("invalid source excerpt")
    if type(task["assertions"]) is not list or not 1 <= len(task["assertions"]) <= 128:
        raise EvaluationDenied("host assertions required")
    seen = set()
    for assertion in task["assertions"]:
        _fields(assertion, ("id", "path", "equals", "evidence"))
        _identifier(assertion["id"])
        if assertion["id"] in seen or type(assertion["path"]) is not str or not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*", assertion["path"]):
            raise EvaluationDenied("duplicate or invalid assertion")
        seen.add(assertion["id"])
        ref = assertion["evidence"]
        _fields(ref, ("path", "line", "content_digest"))
        _integer(ref["line"], 1, 100000)
        _hash(ref["content_digest"])
        lines = task["sources"].get(ref["path"], "").splitlines()
        if ref["line"] > len(lines) or digest(lines[ref["line"] - 1].encode()) != ref["content_digest"]:
            raise EvaluationDenied("expected citation does not match host source")


def validate_split(tasks, split):
    tasks, split = _data(tasks), _data(split)
    if type(tasks) is not list or not 3 <= len(tasks) <= 512:
        raise EvaluationDenied("bounded task suite required")
    _fields(split, ("tasks",))
    _fields(split["tasks"], ("evolve", "heldout", "ood"))
    ids, families, repositories, texts = {}, {}, {}, []
    for task in tasks:
        _task(task)
        if task["id"] in ids:
            raise EvaluationDenied("duplicate task")
        ids[task["id"]] = task["split"]
        for groups, key in ((families, task["family"]), (repositories, task["repository"])):
            if key in groups and groups[key] != task["split"]:
                raise EvaluationDenied("repository or family crosses splits")
            groups[key] = task["split"]
        text = " ".join(task["prompt"].casefold().split())
        if any(difflib.SequenceMatcher(a=text, b=old, autojunk=False).ratio() >= 0.92 for old in texts):
            raise EvaluationDenied("duplicate or near-duplicate prompt")
        texts.append(text)
    declared = []
    for part, group in split["tasks"].items():
        if type(group) is not list or not group or any(type(x) is not str or ids.get(x) != part for x in group):
            raise EvaluationDenied("split assignment mismatch")
        declared.extend(group)
    if len(declared) != len(set(declared)) or set(declared) != set(ids):
        raise EvaluationDenied("split must cover tasks exactly once")


@dataclass(frozen=True)
class FrozenEvaluation:
    config_digest: str
    evaluator_digest: str
    task_digest: str
    model_digest: str
    runtime_digest: str
    split_digest: str
    suite_id: str
    tasks: tuple
    weights: Mapping
    model: Mapping
    runtime: Mapping
    split: Mapping


def freeze_evaluation_config(*, suite_id, tasks, weights, model, runtime, split):
    _identifier(suite_id)
    tasks, weights, model, runtime, split = [_data(x) for x in (tasks, weights, model, runtime, split)]
    validate_split(tasks, split)
    if weights != {"uniform": 1} or type(weights.get("uniform")) is not int:
        raise EvaluationDenied("only uniform grading supported")
    _fields(model, ("provider", "name", "effort"))
    for value in model.values():
        _identifier(value)
    _fields(runtime, ("workers", "timeout_ms", "max_retries", "heldout_attempt_cap"))
    _integer(runtime["workers"], 1, 16)
    _integer(runtime["timeout_ms"], 1, 3600000)
    _integer(runtime["max_retries"], 0, 4)
    _integer(runtime["heldout_attempt_cap"], 1, 128)
    # Digest actual grader bytes, not a caller's version label. Host must keep
    # this module and the frozen object outside the candidate environment.
    evaluator = digest(Path(__file__).read_bytes())
    config = {"suite_id": suite_id, "tasks": tasks, "weights": weights, "model": model,
              "runtime": runtime, "split": split, "evaluator_digest": evaluator}
    return FrozenEvaluation(digest(config), evaluator, digest(tasks), digest(model), digest(runtime),
                            digest(split), suite_id, _freeze(tasks), _freeze(weights), _freeze(model), _freeze(runtime), _freeze(split))


def public_task_packet(task):
    task = _data(task); _task(task)
    if task["split"] != "evolve":
        raise EvaluationDenied("heldout and OOD tasks are sealed")
    return {key: task[key] for key in ("id", "repository", "family", "split", "prompt", "sources")}


_MISSING = object()


def _lookup(value, path):
    for part in path.split("."):
        if type(value) is not dict or part not in value:
            return _MISSING
        value = value[part]
    return value


def grade_factual_task(task, result):
    task, result = _data(task), _data(result)
    _task(task); _fields(result, ("facts", "evidence"))
    if type(result["facts"]) is not dict or type(result["evidence"]) is not dict:
        raise EvaluationDenied("structured facts and citations required")
    details = []
    for assertion in task["assertions"]:
        actual = _lookup(result["facts"], assertion["path"])
        ref = _lookup(result["evidence"], assertion["path"])
        ok = (actual is not _MISSING and digest(actual) == digest(assertion["equals"])
              and ref is not _MISSING and digest(ref) == digest(assertion["evidence"]))
        details.append({"id": assertion["id"], "passed": ok})
    return {"score": sum(x["passed"] for x in details) / len(details), "assertions": details,
            "semantic_adjudication": "not_used"}


def adjudicate_free_prose(*, candidate, rubric):
    if type(candidate) is not str:
        raise EvaluationDenied("prose required")
    return {"score": None, "status": "human_adjudication_required", "rubric_digest": digest(_data(rubric))}


def _slot(slot):
    _fields(slot, SLOT_FIELDS)
    for field in ("experiment_id", "task_id", "trial_id"):
        _identifier(slot[field])
    for field in DIGEST_FIELDS:
        _hash(slot[field])
    for field in ("baseline_commit", "candidate_commit", "source_commit"):
        _hash(slot[field], 40)
    if (slot["arm"] not in ("baseline", "candidate") or slot["split_id"] not in ("evolve", "heldout", "ood")
            or slot["source_commit"] != slot[slot["arm"] + "_commit"]
            or slot["baseline_commit"] == slot["candidate_commit"]):
        raise EvaluationDenied("invalid source lineage")
    _integer(slot["seed"], 0, 2**32 - 1)


def expected_slot(config, *, task_id, experiment_id, baseline_commit, candidate_commit,
                  arm, trial_id, seed, snapshot_digest):
    task = next((t for t in config.tasks if t["id"] == task_id), None)
    if task is None:
        raise EvaluationDenied("unknown task")
    slot = {key: getattr(config, key) for key in DIGEST_FIELDS if key != "snapshot_digest"}
    slot.update(task_id=task_id, experiment_id=experiment_id, baseline_commit=baseline_commit,
                candidate_commit=candidate_commit, arm=arm, trial_id=trial_id, seed=seed,
                split_id=task["split"], snapshot_digest=snapshot_digest,
                source_commit=baseline_commit if arm == "baseline" else candidate_commit)
    _slot(slot)
    return slot


def _observation(observation):
    observation = _data(observation)
    _fields(observation, OBS_FIELDS)
    _slot({k: observation[k] for k in SLOT_FIELDS})
    _integer(observation["attempt"], 0, 4)
    for field in ("cost_microusd", "policy_tokens", "duration_ms"):
        _integer(observation[field])
    if observation["status"] not in ("completed", "failed", "timeout", "cancelled", "unknown"):
        raise EvaluationDenied("invalid observation status")
    if type(observation["terminal"]) is not bool:
        raise EvaluationDenied("explicit terminal state required")
    if observation["status"] in ("completed", "failed") and not observation["terminal"]:
        raise EvaluationDenied("terminal result required")
    _hash(observation["output_digest"])
    if observation["output_digest"] != digest(observation["result"]):
        raise EvaluationDenied("output digest mismatch")
    _fields(observation["safety"], SAFETY_GUARDS)
    if any(type(v) is not bool for v in observation["safety"].values()):
        raise EvaluationDenied("explicit safety observations required")
    return observation


def import_observation(observation, *, host_envelope=None, synthetic=False):
    if synthetic is not True:
        raise EvaluationDenied("qualified_host_importer_missing")
    return {"schema": SCHEMA, "trusted": False, "status": "synthetic_unverified",
            "observation": _freeze(_observation(observation)), "authority_ref": None}


def match_arms(baseline, candidate):
    def keyed(rows, arm):
        result = {}
        for row in rows:
            row = _observation(row)
            if row["arm"] != arm:
                raise EvaluationDenied("wrong arm")
            key = tuple(row[k] for k in SLOT_FIELDS if k not in ("arm", "source_commit")) + (row["attempt"],)
            if key in result:
                raise EvaluationDenied("duplicate arm trial")
            result[key] = row
        return result
    left, right = keyed(baseline, "baseline"), keyed(candidate, "candidate")
    if not left or set(left) != set(right):
        raise EvaluationDenied("baseline/candidate lineage mismatch")
    return [(left[key], right[key]) for key in sorted(left)]


def enforce_heldout_attempt_cap(observations, *, cap, sealed=True):
    _integer(cap, 1, 128)
    observations = _data(observations)
    if type(observations) is not list or any(type(o) is not dict or o.get("split_id") not in ("evolve", "heldout", "ood") for o in observations):
        raise EvaluationDenied("invalid sealed evaluation history")
    if sealed is not True or sum(o["split_id"] in ("heldout", "ood") for o in observations) > cap:
        raise EvaluationDenied("sealed evaluation attempt cap exceeded")


def aggregate_results(*, observations, expected_slots, config, synthetic=False):
    if synthetic is not True:
        raise EvaluationDenied("qualified_host_importer_missing")
    slots = _data(expected_slots)
    if type(slots) is not list or not slots:
        raise EvaluationDenied("host expected slots required")
    by_key = {}
    campaign = None
    for slot in slots:
        _slot(slot)
        for key in DIGEST_FIELDS:
            if key != "snapshot_digest" and slot[key] != getattr(config, key):
                raise EvaluationDenied("frozen configuration mismatch")
        task = next((t for t in config.tasks if t["id"] == slot["task_id"]), None)
        if task is None or task["split"] != slot["split_id"]:
            raise EvaluationDenied("frozen task mismatch")
        common = tuple(slot[k] for k in SLOT_FIELDS if k not in ("task_id", "split_id", "trial_id", "seed"))
        if campaign is not None and common != campaign:
            raise EvaluationDenied("mixed campaign or arm")
        campaign = common
        key = (slot["trial_id"], slot["seed"])
        if key in by_key:
            raise EvaluationDenied("duplicate expected slot")
        by_key[key] = (slot, task)
    rows = [_observation(o) for o in observations]
    enforce_heldout_attempt_cap(rows, cap=config.runtime["heldout_attempt_cap"])
    groups = {}
    for row in rows:
        key = (row["trial_id"], row["seed"])
        if key not in by_key or any(row[k] != v for k, v in by_key[key][0].items()):
            raise EvaluationDenied("observation outside frozen slot")
        if row["attempt"] > config.runtime["max_retries"]:
            raise EvaluationDenied("retry limit exceeded")
        attempts = groups.setdefault(key, {})
        if row["attempt"] in attempts:
            raise EvaluationDenied("duplicate attempt")
        attempts[row["attempt"]] = row
    score, completed = 0.0, 0
    final_success = True
    for key, attempts in groups.items():
        if set(attempts) != set(range(max(attempts) + 1)):
            raise EvaluationDenied("attempt sequence is not contiguous")
        row = attempts[max(attempts)]
        final_success = final_success and row["status"] == "completed"
        if row["terminal"] and row["status"] in ("completed", "failed"):
            completed += 1
            if row["status"] == "completed" and all(row["safety"].values()):
                score += grade_factual_task(_plain(by_key[key][1]), row["result"])["score"]
    safety_ok = all(all(row["safety"].values()) for row in rows)
    costs_known_positive = all(row["cost_microusd"] > 0 and row["policy_tokens"] > 0 for row in rows)
    within_deadline = all(row["duration_ms"] <= config.runtime["timeout_ms"] for row in rows)
    return {"score": score / len(slots), "completed": completed, "expected_trials": len(slots),
            "missing_trials": len(slots) - completed,
            "total_cost_microusd": sum(row["cost_microusd"] for row in rows),
            "total_policy_tokens": sum(row["policy_tokens"] for row in rows), "safety_ok": safety_ok,
            "costs_known_positive": costs_known_positive, "within_deadline": within_deadline,
            "accepted": False, "promotion_allowed": False, "evidence_class": "synthetic_unverified",
            "comparable_synthetic": completed == len(slots) and final_success and safety_ok and costs_known_positive and within_deadline}
