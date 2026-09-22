#!/usr/bin/env python3
"""Explicit local-snapshot Laya worker. No download, server, or execution API.

A manifest binds reviewed LOCAL bytes; its upstream revision is owner-asserted,
not a cryptographic attestation from Hugging Face. OS network isolation is still
recommended: library offline flags are not a general-purpose security sandbox.
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
CONTRACT_BYTES = (HERE / "contract.json").read_bytes()
CONTRACT = json.loads(CONTRACT_BYTES)
REQUIRED = {"model.safetensors", "rl_agent_config.json", "encoder/config.json",
            "tokenizer/tokenizer.json", "tokenizer/tokenizer_config.json"}
ORIGIN = "owner_asserted_local_snapshot"


class Invalid(ValueError):
    pass


def require(condition, code):
    if not condition:
        raise Invalid(code)


def read_json(path):
    require(path.stat().st_size <= 32 * 1024 * 1024, "json_file_too_large")
    return json.loads(path.read_text(encoding="utf-8"))


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def artifact_files(model_dir):
    model_dir = Path(model_dir)
    require(model_dir.is_absolute() and model_dir.is_dir() and not model_dir.is_symlink(), "absolute_local_model_required")
    entries = sorted(model_dir.rglob("*"))
    require(len(entries) <= 64, "too_many_artifacts")
    files = {}
    for path in entries:
        require(not path.is_symlink(), "symlink_artifact_rejected")
        relative = path.relative_to(model_dir).as_posix()
        if path.is_dir():
            require(relative in ("encoder", "tokenizer"), "unexpected_artifact_directory")
            continue
        require(path.is_file(), "nonregular_artifact")
        allowed = relative in REQUIRED or (
            relative.startswith("tokenizer/") and relative.count("/") == 1 and relative.endswith(".json"))
        require(allowed, "unexpected_artifact")
        files[relative] = file_hash(path)
    require(REQUIRED <= set(files), "missing_artifacts")
    tokenizer = read_json(model_dir / "tokenizer/tokenizer_config.json")
    # Agent._fix_tokenizer_config must not mutate the reviewed local files.
    require(tokenizer.get("tokenizer_class") not in (None, "TokenizersBackend")
            and not isinstance(tokenizer.get("extra_special_tokens"), list), "tokenizer_requires_reviewed_normalization")
    return files


def make_manifest(model_dir, revision):
    require(isinstance(revision, str) and re.fullmatch(r"[0-9a-f]{40}", revision) and revision == CONTRACT["model_revision"], "pinned_model_revision_required")
    return {"schema_version": 1, "model_repository": CONTRACT["model_repository"],
            "model_revision": revision, "sdk_commit": CONTRACT["sdk_commit"],
            "origin": ORIGIN, "files": artifact_files(model_dir)}


def verify_manifest(model_dir, manifest_path):
    require(manifest_path and Path(manifest_path).is_file(), "manifest_required")
    manifest = read_json(Path(manifest_path))
    require(isinstance(manifest, dict) and set(manifest) == {
        "schema_version", "model_repository", "model_revision", "sdk_commit", "origin", "files"}, "invalid_manifest")
    require(manifest["schema_version"] == 1 and manifest["model_repository"] == CONTRACT["model_repository"]
            and manifest["sdk_commit"] == CONTRACT["sdk_commit"] and manifest["origin"] == ORIGIN, "manifest_identity_mismatch")
    require(isinstance(manifest["model_revision"], str)
            and re.fullmatch(r"[0-9a-f]{40}", manifest["model_revision"]) and manifest["model_revision"] == CONTRACT["model_revision"], "pinned_model_revision_required")
    require(isinstance(manifest["files"], dict) and all(isinstance(v, str) and re.fullmatch(r"[0-9a-f]{64}", v)
            for v in manifest["files"].values()), "invalid_artifact_hashes")
    require(artifact_files(model_dir) == manifest["files"], "artifact_hash_mismatch")
    return manifest


def verify_sdk():
    try:
        dist = importlib.metadata.distribution("laya")
        direct = json.loads(dist.read_text("direct_url.json") or "{}")
    except (importlib.metadata.PackageNotFoundError, ValueError) as exc:
        raise Invalid("pinned_sdk_required") from exc
    require(direct.get("url") == "https://github.com/NandhaKishorM/laya.git"
            and direct.get("vcs_info", {}).get("commit_id") == CONTRACT["sdk_commit"]
            and not direct.get("dir_info", {}).get("editable"), "pinned_sdk_required")
    return {name: importlib.metadata.version(name) for name in
            ("laya", "torch", "transformers", "huggingface-hub", "safetensors", "numpy")}


def ensure_budget(agent, task, build_sequence, render_options):
    question = CONTRACT["questions"][CONTRACT["question_id"]]
    internal = {"t": "choice", "ins": question["instructions"], "crit": question["criteria"]}
    max_len, head_len = agent.cfg.get("max_len", 512), agent.cfg.get("head_max_len", 192)
    require(type(max_len) is int and type(head_len) is int and 32 <= head_len < max_len <= 1024, "unsupported_token_budget")
    tok = agent.tok
    options = render_options(internal)
    lengths = [1 + len(tok(" " + option.replace(tok.mask_token, " "), add_special_tokens=False)["input_ids"]) for option in options]
    require(all(length <= 49 for length in lengths), "option_would_truncate")
    option_budget = head_len - sum(lengths)
    head_tokens = tok("choice question: " + question["instructions"].replace(tok.mask_token, " "), add_special_tokens=False)["input_ids"]
    require(option_budget >= 16 and len(head_tokens) <= option_budget, "question_would_truncate")
    empty, markers = build_sequence(tok, "", internal, max_len, head_len)
    require(len(markers) == len(options), "option_markers_missing")
    state_tokens = tok(task.replace(tok.mask_token, " "), add_special_tokens=False)["input_ids"]
    require(len(state_tokens) <= max_len - len(empty), "task_would_truncate")


def predict(model_dir, manifest_path, task):
    require(isinstance(task, str) and task.strip() and len(task.encode("utf-8")) <= CONTRACT["max_task_bytes"], "invalid_task")
    manifest = verify_manifest(model_dir, manifest_path)
    versions = verify_sdk()
    with tempfile.TemporaryDirectory(prefix="fable-laya-") as cache:
        os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
                          HF_HOME=cache, XDG_CACHE_HOME=cache, USE_TF="0", TOKENIZERS_PARALLELISM="false")
        os.environ.pop("HF_TOKEN", None)
        with open(os.devnull, "w", encoding="utf-8") as quiet, contextlib.redirect_stdout(quiet), contextlib.redirect_stderr(quiet):
            from laya import Agent
            from laya.common import build_sequence, render_options
            start = time.perf_counter()
            agent = Agent(str(Path(model_dir).resolve()), device="cpu")
            load_ms = (time.perf_counter() - start) * 1000
            ensure_budget(agent, task, build_sequence, render_options)
            start = time.perf_counter()
            result = agent.predict(task, CONTRACT["questions"])
            inference_ms = (time.perf_counter() - start) * 1000
        # Discard upstream confidence and act_probability: neither grants authority.
        probabilities = result["answers"][CONTRACT["question_id"]]["probabilities"]
    return {"probabilities": probabilities,
            "provenance": {"model_repository": manifest["model_repository"], "model_revision": manifest["model_revision"],
                           "sdk_commit": CONTRACT["sdk_commit"], "manifest_sha256": file_hash(Path(manifest_path)),
                           "question_sha256": hashlib.sha256(CONTRACT_BYTES).hexdigest(), "runtime_versions": versions, "origin": ORIGIN},
            "timing": {"load_ms": round(load_ms, 3), "inference_ms": round(inference_ms, 3)}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("manifest", "predict"))
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--model-revision")
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "manifest":
            require(args.manifest is None, "unexpected_manifest")
            result = make_manifest(args.model_dir, args.model_revision)
        else:
            require(args.model_revision is None, "unexpected_revision")
            raw = sys.stdin.buffer.read(32769)
            require(len(raw) <= 32768, "input_too_large")
            request = json.loads(raw)
            require(isinstance(request, dict) and set(request) == {"task"}, "invalid_request")
            result = predict(args.model_dir, args.manifest, request["task"])
        print(json.dumps(result, allow_nan=False))
        return 0
    except Exception as exc:
        # Raw import, tokenizer, dependency, and model errors can contain input or paths.
        code = str(exc) if isinstance(exc, Invalid) else "local_worker_failed"
        print(json.dumps({"error": code}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
