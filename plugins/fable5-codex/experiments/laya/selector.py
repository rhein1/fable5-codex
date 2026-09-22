#!/usr/bin/env python3
"""Optional, read-only Fable playbook experiment. Standard library only here.

The existing keyword selector remains the default AND the selected result in
shadow mode. Laya proposes a separate candidate; no action is ever dispatched.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import re
import time
import unicodedata

HERE = Path(__file__).resolve().parent
CONTRACT_BYTES = (HERE / "contract.json").read_bytes()
CONTRACT = json.loads(CONTRACT_BYTES)
LABELS = tuple(CONTRACT["questions"][CONTRACT["question_id"]]["criteria"])
PLAYBOOKS = LABELS[:-1]
MAX_JSON_BYTES = 32768
MAX_OUTPUT_BYTES = 65536


class Invalid(ValueError):
    """Fixed diagnostic codes only: never include user text or provider output."""


def require(condition, code):
    if not condition:
        raise Invalid(code)


def object_keys(value, allowed, required=()):
    require(isinstance(value, dict), "expected_object")
    require(set(value) <= set(allowed) and set(required) <= set(value), "invalid_fields")


def decode_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            require(key not in value, "duplicate_json_key")
            value[key] = item
        return value
    def constant(_):
        raise Invalid("nonfinite_json")
    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
    except (json.JSONDecodeError, UnicodeError) as exc:
        raise Invalid("invalid_json") from exc


def validate_request(request):
    object_keys(request, ("task", "language", "explicit_playbook"), ("task",))
    task = request["task"]
    require(isinstance(task, str), "invalid_task")
    try:
        size = len(task.encode("utf-8"))
    except UnicodeError as exc:
        raise Invalid("invalid_task_encoding") from exc
    require(size <= CONTRACT["max_task_bytes"], "task_too_large")
    language = request.get("language", "en")
    require(isinstance(language, str) and len(language) <= 16, "invalid_language")
    explicit = request.get("explicit_playbook")
    require(explicit is None or (isinstance(explicit, str) and explicit in PLAYBOOKS), "invalid_explicit_playbook")
    return {"task": task, "language": language, "explicit_playbook": explicit}


def unsupported(request):
    # Conservative script check, NOT an English-language detector. The caller
    # declares language. Latin-script non-English text cannot be detected here.
    return request["language"] != "en" or any(
        c.isalpha() and "LATIN" not in unicodedata.name(c, "") for c in request["task"]
    )


def child_env():
    # Do not pass the caller's API keys, Python path, proxy settings, or HF token.
    allowed = ("PATH", "SystemRoot", "WINDIR", "SYSTEMDRIVE", "COMSPEC", "PATHEXT",
               "TMP", "TEMP", "TMPDIR", "LANG", "LC_ALL")
    env = {k: os.environ[k] for k in allowed if k in os.environ}
    env.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
               USE_TF="0", TOKENIZERS_PARALLELISM="false", PYTHONDONTWRITEBYTECODE="1")
    return env


def run_json(argv, payload, timeout):
    require(isinstance(timeout, (int, float)) and not isinstance(timeout, bool)
            and math.isfinite(timeout) and 0 < timeout <= 300, "invalid_timeout")
    with tempfile.TemporaryFile() as output:
        try:
            result = subprocess.run(argv, input=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                                    stdout=output, stderr=subprocess.DEVNULL,
                                    timeout=timeout, env=child_env(), shell=False, check=False)
        except subprocess.TimeoutExpired as exc:
            raise Invalid("provider_timeout") from exc
        except OSError as exc:
            raise Invalid("provider_unavailable") from exc
        require(result.returncode == 0, "provider_failed")
        output.seek(0, os.SEEK_END)
        require(output.tell() <= MAX_OUTPUT_BYTES, "provider_output_too_large")
        output.seek(0)
        return decode_json(output.read(MAX_OUTPUT_BYTES))


def keyword_baseline(request, node="node"):
    bridge = HERE.parents[1] / "scripts" / "laya-baseline.mjs"
    data = run_json([node, str(bridge)], {"task": request["task"]}, 10)
    object_keys(data, ("playbook", "recipe", "candidates", "reason"), ("playbook", "candidates", "reason"))
    require(data["playbook"] is None or data["playbook"] in PLAYBOOKS, "invalid_baseline")
    require(isinstance(data["candidates"], list) and all(p in PLAYBOOKS for p in data["candidates"]), "invalid_baseline")
    require(data["reason"] in ("no_matching_recipe", "unique_recipe_membership", "ambiguous_recipe_membership"), "invalid_baseline")
    return data


def assess_probabilities(probabilities):
    require(isinstance(probabilities, dict) and set(probabilities) == set(LABELS), "invalid_labels")
    for value in probabilities.values():
        require(isinstance(value, (int, float)) and not isinstance(value, bool)
                and math.isfinite(value) and 0 <= value <= 1, "invalid_probability")
    # Upstream rounds seven option values to four decimals; tolerate that only.
    require(abs(sum(probabilities.values()) - 1) <= 0.0005, "invalid_probability_sum")
    ranked = sorted(probabilities, key=lambda key: (-probabilities[key], key))
    top, second = ranked[:2]
    probability, margin = probabilities[top], probabilities[top] - probabilities[second]
    candidate = top if top != "unclear" and probability >= CONTRACT["min_probability"] and margin >= CONTRACT["min_margin"] else None
    return {"candidate": candidate, "argmax": top, "probabilities": probabilities,
            "max_probability": probability, "margin": margin,
            "reason": "unclear" if top == "unclear" else "experimental_threshold_met" if candidate else "experimental_abstention",
            "calibration_status": CONTRACT["calibration_status"]}


def laya_observation(request, model_dir, manifest, timeout=120):
    require(model_dir and manifest, "local_model_and_manifest_required")
    data = run_json([sys.executable, "-I", "-B", str(HERE / "worker.py"), "predict",
                     "--model-dir", str(model_dir), "--manifest", str(manifest)],
                    {"task": request["task"]}, timeout)
    object_keys(data, ("probabilities", "provenance", "timing"), ("probabilities", "provenance", "timing"))
    result = assess_probabilities(data["probabilities"])
    provenance = data["provenance"]
    object_keys(provenance, ("model_repository", "model_revision", "sdk_commit", "manifest_sha256", "question_sha256", "runtime_versions", "origin"),
                ("model_repository", "model_revision", "sdk_commit", "manifest_sha256", "question_sha256", "runtime_versions", "origin"))
    require(provenance["sdk_commit"] == CONTRACT["sdk_commit"]
            and provenance["model_repository"] == CONTRACT["model_repository"]
            and provenance["model_revision"] == CONTRACT["model_revision"]
            and provenance["origin"] == "owner_asserted_local_snapshot"
            and provenance["question_sha256"] == hashlib.sha256(CONTRACT_BYTES).hexdigest(), "provenance_mismatch")
    require(isinstance(provenance["manifest_sha256"], str)
            and re.fullmatch(r"[0-9a-f]{64}", provenance["manifest_sha256"]), "invalid_manifest_digest")
    versions = provenance["runtime_versions"]
    require(isinstance(versions, dict) and set(versions) == {"laya", "torch", "transformers", "huggingface-hub", "safetensors", "numpy"}
            and all(isinstance(v, str) and 0 < len(v) <= 100 for v in versions.values()), "invalid_runtime_versions")
    require(isinstance(data["timing"], dict) and set(data["timing"]) == {"load_ms", "inference_ms"}, "invalid_timing")
    require(all(isinstance(v, (float, int)) and not isinstance(v, bool) and math.isfinite(v) and v >= 0
                for v in data["timing"].values()), "invalid_timing")
    return {**result, "provenance": provenance, "timing": data["timing"]}


def suggest(request, *, engine="keyword", model_dir=None, manifest=None, timeout=120,
            baseline_fn=None, laya_fn=None):
    request = validate_request(request)
    require(engine in ("keyword", "laya-shadow"), "invalid_engine")
    started = time.perf_counter()
    result = {"schema_version": 1, "advisory_only": True, "execution_performed": False,
              "selected_playbook": None, "selection_source": "abstain", "baseline": None, "baseline_status": "not_requested",
              "laya": {"status": "not_requested"}, "promotion_eligible": False}
    if request["explicit_playbook"] is not None:
        result.update(selected_playbook=request["explicit_playbook"], selection_source="explicit")
        result["laya"] = {"status": "skipped_explicit_selection"}
    elif not request["task"].strip() or unsupported(request):
        result["laya"] = {"status": "skipped_unsupported_or_empty"}
        result["baseline_status"] = "policy_abstain"
    else:
        try:
            result["baseline"] = (baseline_fn or keyword_baseline)(request)
            result["baseline_status"] = "observed"
            result["selected_playbook"] = result["baseline"]["playbook"]
            result["selection_source"] = "keyword" if result["selected_playbook"] else "abstain"
        except Invalid as exc:
            result["baseline"] = {"playbook": None, "reason": str(exc)}
            result["baseline_status"] = "failed"
        if engine == "laya-shadow":
            try:
                observation = (laya_fn or laya_observation)(request, model_dir, manifest, timeout)
                result["laya"] = {"status": "observed", **observation}
            except Invalid as exc:
                result["laya"] = {"status": "failed", "reason": str(exc)}
            # Deliberately NEVER replace selected_playbook with the model candidate.
    result["wall_ms"] = round((time.perf_counter() - started) * 1000, 3)
    return result


def validate_dataset(dataset):
    object_keys(dataset, ("schema_version", "kind", "cases"), ("schema_version", "kind", "cases"))
    require(type(dataset["schema_version"]) is int and dataset["schema_version"] == 1 and dataset["kind"] in ("synthetic_seed", "owner_redacted"), "invalid_dataset")
    require(isinstance(dataset["cases"], list) and 0 < len(dataset["cases"]) <= 10000, "invalid_cases")
    ids, texts, group_splits = set(), set(), {}
    for case in dataset["cases"]:
        object_keys(case, ("id", "group", "split", "request", "acceptable"), ("id", "group", "split", "request", "acceptable"))
        for name in ("id", "group"):
            value = case[name]
            require(isinstance(value, str) and 0 < len(value) <= 80
                    and all(c in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in value), "invalid_case_id")
        require(case["id"] not in ids, "duplicate_case_id")
        ids.add(case["id"])
        require(case["split"] in ("development", "validation", "test"), "invalid_split")
        require(case["group"] not in group_splits or group_splits[case["group"]] == case["split"], "group_split_leakage")
        group_splits[case["group"]] = case["split"]
        request = validate_request(case["request"])
        normalized = " ".join(request["task"].casefold().split())
        require(normalized not in texts, "duplicate_task")
        texts.add(normalized)
        acceptable = case["acceptable"]
        require(isinstance(acceptable, list) and 0 < len(acceptable) <= len(LABELS), "invalid_acceptable")
        require(all(v is None or (isinstance(v, str) and v in PLAYBOOKS) for v in acceptable), "invalid_acceptable")
        require(len(set(acceptable)) == len(acceptable), "duplicate_acceptable")
    return dataset


def metrics(rows, key):
    count = len(rows)
    if not count:
        return None
    answered = [r for r in rows if r[key] is not None]
    expected_abstain = [r for r in rows if r["acceptable"] == [None]]
    return {"cases": count, "acceptable_rate": sum(r[key] in r["acceptable"] for r in rows) / count,
            "coverage": len(answered) / count,
            "accuracy_when_answered": sum(r[key] in r["acceptable"] for r in answered) / len(answered) if answered else None,
            "expected_abstention_cases": len(expected_abstain),
            "abstention_recall": sum(r[key] is None for r in expected_abstain) / len(expected_abstain) if expected_abstain else None}


def evaluate(dataset, *, split="test", **options):
    dataset = validate_dataset(dataset)
    require(split in ("development", "validation", "test"), "invalid_split")
    cases = [case for case in dataset["cases"] if case["split"] == split]
    require(bool(cases), "empty_evaluation_split")
    rows, observed_rows, paired, provenance, elapsed = [], [], [], [], []
    for case in cases:
        result = suggest(case["request"], **options)
        observed = result["laya"]["status"] == "observed"
        row = {"id": case["id"], "acceptable": case["acceptable"],
               "baseline": result["selected_playbook"],
               "selection_source": result["selection_source"], "baseline_status": result["baseline_status"],
               "laya_status": result["laya"]["status"],
               "laya_candidate": result["laya"].get("candidate"), "wall_ms": result["wall_ms"]}
        if "reason" in result["laya"]:
            row["laya_reason"] = result["laya"]["reason"]
        rows.append(row)
        elapsed.append(result["wall_ms"])
        if observed:
            row["probabilities"] = result["laya"]["probabilities"]
            row["model_timing"] = result["laya"].get("timing")
            observed_rows.append(row)
            if row["baseline_status"] == "observed":
                paired.append(row)
            origin = result["laya"].get("provenance")
            if origin not in provenance:
                provenance.append(origin)
    ordinary = [r for r in rows if r["selection_source"] != "explicit"]
    attempted = [r for r in ordinary if r["laya_status"] in ("observed", "failed")]
    def percentile(p):
        ordered = sorted(elapsed)
        return ordered[max(0, math.ceil(p * len(ordered)) - 1)]
    return {"schema_version": 1, "dataset_kind": dataset["kind"], "split": split,
            "dataset_sha256": hashlib.sha256(json.dumps(dataset, sort_keys=True).encode()).hexdigest(),
            "question_sha256": hashlib.sha256(CONTRACT_BYTES).hexdigest(),
            "status": "not_run" if options.get("engine", "keyword") == "keyword" else
                      "complete" if attempted and len(observed_rows) == len(attempted) else "partial_or_unavailable",
            "promotion_eligible": False, "calibration_status": CONTRACT["calibration_status"],
            "total_cases": len(rows), "explicit_cases_excluded_from_model_metrics": len(rows) - len(ordinary),
            "laya_attempted": len(attempted), "laya_observed": len(observed_rows), "paired_observed": len(paired),
            "baseline_failed": sum(r["baseline_status"] == "failed" for r in ordinary),
            "baseline_metrics": metrics([r for r in ordinary if r["baseline_status"] in ("observed", "policy_abstain")], "baseline"),
            "observed_laya_metrics": metrics(observed_rows, "laya_candidate"),
            "paired_observed_baseline_metrics": metrics(paired, "baseline"),
            "paired_observed_laya_metrics": metrics(paired, "laya_candidate"),
            "wall_ms": {"p50": percentile(.5), "p95": percentile(.95), "kind": "end_to_end_cold_subprocess_per_case"},
            "peak_memory_bytes": None, "provenance": provenance, "cases": rows,
            "limitations": ["Synthetic seeds are not deployment evidence.",
                            "Latin-script language is caller-declared, not detected.",
                            "No Fable calibration, warm latency, or memory measurement is implied.",
                            "Missing model observations are not successes; paired metrics exclude failed/skipped rows.",
                            "Near-duplicate and private-data review remain owner responsibilities."]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("suggest", "evaluate", "validate-dataset"))
    parser.add_argument("--engine", choices=("keyword", "laya-shadow"), default="keyword")
    parser.add_argument("--model-dir", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--dataset", type=Path)
    parser.add_argument("--split", choices=("development", "validation", "test"), default="test")
    args = parser.parse_args(argv)
    try:
        require(math.isfinite(args.timeout) and 0 < args.timeout <= 300, "invalid_timeout")
        options = dict(engine=args.engine, model_dir=args.model_dir, manifest=args.manifest, timeout=args.timeout)
        if args.command == "suggest":
            require(args.dataset is None, "unexpected_dataset")
            raw = sys.stdin.buffer.read(MAX_JSON_BYTES + 1)
            require(len(raw) <= MAX_JSON_BYTES, "input_too_large")
            result = suggest(decode_json(raw), **options)
        else:
            require(args.dataset is not None, "dataset_required")
            require(args.dataset.stat().st_size <= 16 * 1024 * 1024, "dataset_too_large")
            dataset = decode_json(args.dataset.read_bytes())
            if args.command == "validate-dataset":
                validate_dataset(dataset)
                result = {"valid": True, "cases": len(dataset["cases"]), "kind": dataset["kind"]}
            else:
                result = evaluate(dataset, split=args.split, **options)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        if args.command == "evaluate" and (result["baseline_failed"] or (args.engine == "laya-shadow" and result["status"] != "complete")):
            return 3
        return 0
    except (Invalid, OSError) as exc:
        code = str(exc) if isinstance(exc, Invalid) else "local_file_unavailable"
        print(json.dumps({"error": code, "execution_performed": False}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
