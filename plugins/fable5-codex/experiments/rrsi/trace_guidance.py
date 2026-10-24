"""Opt-in fixture replay beside RRSI's frozen evaluator; no generated execution.

The caller owns this session and its archive tip outside candidate reach. Python
objects and hashes do not establish process isolation, authentication or storage
durability. Only the explicit byte-input methods accept candidate/fixture data.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from threading import Event
import time

import evaluator as e
import source as source_contract
from source import OPTIONS

SCHEMA = "fable-declarative-replay-v1"
MAX_BYTES = 262144
MAX_TRACES = 20
MAX_RECORDS = 20
MAX_TASKS = 16
MAX_CONTEXT_BYTES = 4096  # conservative token upper bound, not a tokenizer
ZERO = "0" * 64
FAILURES = {
    "missing-evidence": ("seek-refutation", "retain-evidence"),
    "unsupported-claim": ("seek-refutation", "retain-unknowns"),
    "missed-boundary": ("test-edge-cases", "retain-evidence"),
    "unknown-cost": ("prioritize-uncertainty", "retain-costs"),
}
BOUNDARY = {key: False for key in (
    "execution", "provider_dispatch", "evaluator_mutation", "tests_mutation",
    "reward_mutation", "permissions_mutation", "approval_mutation", "spending_mutation",
    "identity_mutation", "promotion_mutation", "authority_mutation")}


class GuidanceDenied(ValueError):
    pass


class _Stopped(Exception):
    pass


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode()


def _copy(value):
    return json.loads(encode(value))


def _fields(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise GuidanceDenied("unexpected fields")


def _integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise GuidanceDenied("bounded integer required")


def _hash(value, length=64):
    if type(value) is not str or len(value) != length or any(c not in "0123456789abcdef" for c in value):
        raise GuidanceDenied("exact digest required")


def _pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise GuidanceDenied("duplicate JSON field")
        result[key] = value
    return result


def _bounded(value, depth=0, nodes=None):
    nodes = [0] if nodes is None else nodes
    nodes[0] += 1
    if depth > 12 or nodes[0] > 8192:
        raise GuidanceDenied("input complexity exceeded")
    if type(value) is str:
        if len(value) > 2048:
            raise GuidanceDenied("input string exceeded")
    elif value is None or type(value) is bool:
        pass
    elif type(value) is int:
        if abs(value) > 10**12:
            raise GuidanceDenied("input integer exceeded")
    elif type(value) is float:
        if not math.isfinite(value) or abs(value) > 10**12:
            raise GuidanceDenied("invalid input number")
    elif type(value) in (list, dict):
        if len(value) > 256:
            raise GuidanceDenied("input collection exceeded")
        if type(value) is dict:
            for key in value:
                if type(key) is not str or len(key) > 128:
                    raise GuidanceDenied("invalid input key")
        for child in value.values() if type(value) is dict else value:
            _bounded(child, depth + 1, nodes)
    else:
        raise GuidanceDenied("plain JSON required")
    return value


def decode(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= MAX_BYTES:
        raise GuidanceDenied("bounded JSON bytes required")
    try:
        return _bounded(json.loads(raw, object_pairs_hook=_pairs))
    except (ValueError, UnicodeError, RecursionError) as error:
        raise GuidanceDenied("invalid bounded JSON") from error


def _envelope(kind, body, previous, sequence):
    record = {"schema": SCHEMA, "kind": kind, "sequence": sequence,
              "previous": previous, "body": body, "authority_boundary": dict(BOUNDARY),
              "accepted": False, "promotion_allowed": False,
              "evidence_class": "synthetic_unverified"}
    record["digest"] = e.digest(record)
    return record


def verify_archive(raw, *, expected_tip):
    """Check an export against a separately retained host tip, never self-trust."""
    archive = decode(raw)
    _fields(archive, ("schema", "records", "tip"))
    _hash(expected_tip)
    if archive["schema"] != SCHEMA or archive["tip"] != expected_tip:
        raise GuidanceDenied("archive anchor mismatch")
    records = archive["records"]
    if type(records) is not list or not 0 <= len(records) <= MAX_RECORDS:
        raise GuidanceDenied("archive record limit")
    previous = ZERO
    for index, record in enumerate(records):
        _fields(record, ("schema", "kind", "sequence", "previous", "body", "authority_boundary",
                         "accepted", "promotion_allowed", "evidence_class", "digest"))
        # Python equality treats False == 0 and True == 1. Recompute from the
        # received fields first, then compare canonical encodings, so neither
        # envelope substitutions nor numeric type changes retain an old tip.
        received_digest = e.digest({key: value for key, value in record.items() if key != "digest"})
        if (record["kind"] not in ("binding", "candidate", "replay")
                or (index == 0) != (record["kind"] == "binding")
                or type(record["body"]) is not dict
                or record["digest"] != received_digest
                or encode(record) != encode(_envelope(record["kind"], record["body"], previous, index))):
            raise GuidanceDenied("archive record or chain mismatch")
        previous = record["digest"]
    if previous != expected_tip:
        raise GuidanceDenied("archive tip mismatch")
    return True


class TraceSession:
    """Host-owned fixture session, frozen before proposals; never executes policy.

    An external host can call cancel() from another thread. Cancellation is
    permanent. Reconstructing a session resets offline accounting; this API is
    not a durable global query quota or a qualified live-observation importer.
    """

    def __init__(self, config, *, baseline_commit, snapshot_digest, enabled=False,
                 attempts_per_task=2, token_budget=100000, cost_budget_microusd=100000,
                 wall_ms=1000):
        self.enabled = enabled is True
        self._cancelled = Event()
        self._records = ()  # canonical bytes, never a caller-mutable dict
        self._candidates = {}
        self._sealed_policy = None
        self._heldout_used = 0
        if not self.enabled:
            return
        _hash(baseline_commit, 40); _hash(snapshot_digest)
        _integer(attempts_per_task, 1, 5)
        _integer(token_budget, 1, 10**7); _integer(cost_budget_microusd, 1, 10**9)
        _integer(wall_ms, 1, 5000)
        # Reconstruct, instead of trusting a caller-forged dataclass digest.
        rebuilt = e.freeze_evaluation_config(
            suite_id=config.suite_id, tasks=e._plain(config.tasks), weights=e._plain(config.weights),
            model=e._plain(config.model), runtime=e._plain(config.runtime), split=e._plain(config.split))
        if (rebuilt != config or config.model["provider"] != "synthetic"
                or len(config.tasks) > MAX_TASKS
                or attempts_per_task > config.runtime["max_retries"] + 1
                or wall_ms > config.runtime["timeout_ms"]):
            raise GuidanceDenied("fixture-only frozen configuration required")
        self._config = rebuilt
        self._budget = dict(attempts_per_task=attempts_per_task, token_budget=token_budget,
                            cost_budget_microusd=cost_budget_microusd, wall_ms=wall_ms)
        self._binding = {key: getattr(config, key) for key in e.DIGEST_FIELDS if key != "snapshot_digest"}
        self._binding.update(baseline_commit=baseline_commit, snapshot_digest=snapshot_digest,
                             guidance_digest=e.digest(Path(__file__).read_bytes()),
                             source_digest=e.digest(Path(source_contract.__file__).read_bytes()),
                             options_digest=e.digest(OPTIONS), budget=self._budget)
        self._options = e._freeze(_copy(OPTIONS))
        self._binding_digest = e.digest(self._binding)
        self._baseline_digest = e.digest({"binding": self._binding_digest, "guidance": []})
        self._append("binding", self._binding)

    @property
    def binding_digest(self):
        if not self.enabled:
            raise GuidanceDenied("feature disabled")
        return self._binding_digest

    @property
    def baseline_digest(self):
        if not self.enabled:
            raise GuidanceDenied("feature disabled")
        return self._baseline_digest

    @property
    def archive_tip(self):
        return json.loads(self._records[-1])["digest"] if self._records else ZERO

    def cancel(self):
        self._cancelled.set()

    def _check(self, started):
        if self._cancelled.is_set():
            raise _Stopped("cancelled")
        if (time.monotonic() - started) * 1000 >= self._budget["wall_ms"]:
            raise _Stopped("timeout")

    def _current(self, *, append=True):
        if not self.enabled:
            raise GuidanceDenied("feature disabled")
        if (e.digest(Path(e.__file__).read_bytes()) != self._config.evaluator_digest
                or e.digest(Path(__file__).read_bytes()) != self._binding["guidance_digest"]
                or e.digest(Path(source_contract.__file__).read_bytes()) != self._binding["source_digest"]
                or e.digest(OPTIONS) != self._binding["options_digest"]):
            raise GuidanceDenied("frozen implementation drift")
        if append and len(self._records) >= MAX_RECORDS:
            raise GuidanceDenied("archive capacity exceeded")

    def _append(self, kind, body):
        record = _envelope(kind, _copy(body), self.archive_tip, len(self._records))
        self._records += (encode(record),)
        return _copy(record)

    def export_archive(self):
        return encode({"schema": SCHEMA, "records": [json.loads(raw) for raw in self._records],
                       "tip": self.archive_tip})

    def propose(self, raw_traces, *, parent_digest=None):
        if not self.enabled:
            return {"status": "disabled", "accepted": False, "promotion_allowed": False}
        self._current()
        if self._sealed_policy is not None:
            raise GuidanceDenied("proposals are sealed after heldout admission")
        started = time.monotonic()
        try:
            self._check(started)
            traces = decode(raw_traces)
            if type(traces) is not list or not 1 <= len(traces) <= MAX_TRACES:
                raise GuidanceDenied("trace count exceeded")
            evolve = set(self._config.split["tasks"]["evolve"])
            strategies, contexts, refs = set(), set(), []
            for trace in traces:
                self._check(started)
                _fields(trace, ("task_id", "failure", "output_digest"))
                if type(trace["task_id"]) is not str or trace["task_id"] not in evolve:
                    raise GuidanceDenied("trace is outside development split")
                if type(trace["failure"]) is not str or trace["failure"] not in FAILURES:
                    raise GuidanceDenied("finite failure code required")
                _hash(trace["output_digest"])
                strategy, context = FAILURES[trace["failure"]]
                strategies.add(strategy); contexts.add(context)
                refs.append(e.digest(trace))  # never raw IDs, answers or instructions
            layers = []
            if parent_digest is not None:
                _hash(parent_digest)
                if parent_digest not in self._candidates:
                    raise GuidanceDenied("unknown parent")
                layers = _copy(self._candidates[parent_digest]["layers"])
            if len(layers) >= 2:
                raise GuidanceDenied("maximum guidance depth reached")
            layers.append({"strategy": sorted(strategies), "context": sorted(contexts)})
            rendered = [self._options[kind][item] for layer in layers
                        for kind, items in layer.items() for item in items]
            if len(encode(rendered)) > MAX_CONTEXT_BYTES:
                raise GuidanceDenied("context token upper bound exceeded")
            candidate = dict(binding_digest=self._binding_digest, parent_digest=parent_digest,
                             layers=layers, trace_refs=sorted(set(refs)),
                             context_token_upper_bound=len(encode(rendered)))
            candidate["candidate_digest"] = e.digest(candidate)
            self._check(started)
            if candidate["candidate_digest"] not in self._candidates:
                self._candidates[candidate["candidate_digest"]] = _copy(candidate)
                self._append("candidate", candidate)
            return _copy(candidate)
        except _Stopped as stop:
            return {"status": str(stop), "accepted": False, "promotion_allowed": False}

    def render(self, candidate_digest):
        self._current(append=False)
        if self._cancelled.is_set():
            raise GuidanceDenied("session cancelled")
        _hash(candidate_digest)
        if candidate_digest not in self._candidates:
            raise GuidanceDenied("unknown candidate")
        self._candidate(candidate_digest)
        return [[self._options[kind][item] for kind, items in layer.items() for item in items]
                for layer in self._candidates[candidate_digest]["layers"]]

    def _candidate(self, candidate_digest):
        candidate = self._candidates[candidate_digest]
        if (candidate["candidate_digest"] != candidate_digest
                or candidate["binding_digest"] != self._binding_digest
                or e.digest({k: v for k, v in candidate.items() if k != "candidate_digest"}) != candidate_digest):
            raise GuidanceDenied("host candidate record drift")
        return candidate

    def replay(self, raw_request):
        if not self.enabled:
            return {"status": "disabled", "accepted": False, "promotion_allowed": False}
        self._current()
        # Even an already-cancelled request is hashed into its receipt. Bound it
        # before cancellation/deadline paths, rather than hashing unchecked data.
        if type(raw_request) is not bytes or not 0 < len(raw_request) <= MAX_BYTES:
            raise GuidanceDenied("bounded JSON bytes required")
        started = time.monotonic()
        rows, summaries = {}, []
        status = "completed"
        candidate_id, split = None, None
        metrics = {arm: dict(tokens=0, cost_microusd=0, duration_ms=0) for arm in ("baseline", "policy")}
        violations = 0
        comparable = True
        try:
            self._check(started)
            request = decode(raw_request)
            _fields(request, ("binding_digest", "candidate_digest", "split", "attempts_per_task", "lanes"))
            candidate_id, split = request["candidate_digest"], request["split"]
            _hash(candidate_id)
            if (request["binding_digest"] != self._binding_digest or candidate_id not in self._candidates
                    or split not in ("evolve", "heldout", "ood")
                    or type(request["attempts_per_task"]) is not int
                    or request["attempts_per_task"] != self._budget["attempts_per_task"]):
                raise GuidanceDenied("frozen request binding mismatch")
            _fields(request["lanes"], ("baseline", "policy"))
            self._candidate(candidate_id)
            tasks = [e._plain(task) for task in self._config.tasks if task["split"] == split]
            task_ids = {task["id"] for task in tasks}
            attempts = self._budget["attempts_per_task"]
            expected = {(identifier, attempt) for identifier in task_ids for attempt in range(attempts)}
            if split != "evolve":
                if self._sealed_policy not in (None, candidate_id):
                    raise GuidanceDenied("heldout policy is already fixed")
                reserve = len(expected) * 2
                if self._heldout_used + reserve > self._config.runtime["heldout_attempt_cap"]:
                    raise GuidanceDenied("cumulative heldout budget exceeded")
                self._heldout_used += reserve  # failures and cancellations still consume admission
                self._sealed_policy = candidate_id
            for arm in ("baseline", "policy"):
                lane = request["lanes"][arm]
                if type(lane) is not list or len(lane) > len(expected):
                    raise GuidanceDenied("attempt count exceeded")
                groups = rows[arm] = {}
                expected_input = self._baseline_digest if arm == "baseline" else candidate_id
                for row in lane:
                    self._check(started)
                    _fields(row, ("task_id", "attempt", "input_digest", "status", "result", "safety", "estimated"))
                    _integer(row["attempt"], 0, attempts - 1)
                    if type(row["task_id"]) is not str:
                        raise GuidanceDenied("invalid task identifier")
                    slot = (row["task_id"], row["attempt"])
                    if slot not in expected or slot in groups or row["input_digest"] != expected_input:
                        raise GuidanceDenied("task/attempt/policy mismatch")
                    if row["status"] not in ("completed", "failed", "cancelled", "timeout", "unknown"):
                        raise GuidanceDenied("invalid attempt status")
                    _fields(row["safety"], e.SAFETY_GUARDS)
                    if any(type(flag) is not bool for flag in row["safety"].values()):
                        raise GuidanceDenied("explicit fixture safety flags required")
                    _fields(row["estimated"], ("tokens", "cost_microusd", "duration_ms"))
                    for key, value in row["estimated"].items():
                        _integer(value, 0, 10**9)
                        metrics[arm][key] += value
                    # Charge conservative context overhead to every policy attempt.
                    if arm == "policy":
                        metrics[arm]["tokens"] += self._candidates[candidate_id]["context_token_upper_bound"]
                    unsafe = not all(row["safety"].values())
                    violations += int(unsafe)
                    comparable &= (not unsafe and row["status"] == "completed"
                                   and row["estimated"]["tokens"] > 0
                                   and row["estimated"]["cost_microusd"] > 0
                                   and row["estimated"]["duration_ms"] <= self._config.runtime["timeout_ms"])
                    groups[slot] = row
                comparable &= set(groups) == expected
                if (metrics[arm]["tokens"] > self._budget["token_budget"]
                        or metrics[arm]["cost_microusd"] > self._budget["cost_budget_microusd"]):
                    comparable = False
                    status = "budget_exceeded"
            for task in tasks:
                self._check(started)
                counts = {}
                for arm in ("baseline", "policy"):
                    values = []
                    for attempt in range(attempts):
                        self._check(started)
                        row = rows[arm].get((task["id"], attempt))
                        passed = 0
                        if row and row["status"] == "completed" and all(row["safety"].values()):
                            passed = sum(a["passed"] for a in e.grade_factual_task(task, row["result"])["assertions"])
                        values.append(passed)
                    counts[arm] = values
                summaries.append({"task_digest": e.digest(task["id"]), "assertions": len(task["assertions"]),
                                  "baseline_first": counts["baseline"][0], "flat_retry": counts["baseline"][-1],
                                  "flat_best_of_n_oracle": max(counts["baseline"]),
                                  "single_policy": counts["policy"][-1]})
            self._check(started)
        except _Stopped as stop:
            status, comparable = str(stop), False
        # No winner is selected. Scores are fixture facts, never efficacy evidence.
        regressions = [row["task_digest"] for row in summaries if row["single_policy"] < row["baseline_first"]]
        receipt = dict(binding_digest=self._binding_digest, candidate_digest=candidate_id, split=split,
                       request_digest=e.digest(raw_request), status=status, comparable_fixture=comparable,
                       qualification="incomplete" if not comparable else "regressed" if regressions else "fixture_only",
                       results=summaries, regressions=regressions, policy_violations=violations,
                       fixed_per_arm_budget=self._budget, estimated_attempt_totals=metrics,
                       actual={"offline_elapsed_ms": max(0, int((time.monotonic() - started) * 1000)),
                               "provider_tokens": 0, "provider_cost_microusd": 0},
                       effectiveness_measured=False)
        return self._append("replay", receipt)
