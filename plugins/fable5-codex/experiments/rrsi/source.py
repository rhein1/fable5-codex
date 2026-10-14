"""Offline Fable source binding. No models, plugin installation or promotion.

Run this host-side against quiescent, disposable repositories, never inside a
candidate. Filesystem checks are admission checks, not an isolation mechanism.
"""
from __future__ import annotations

import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess


class Denied(ValueError):
    pass


SKILLS = ("audit", "deep-review", "fact-check", "understand", "design-options", "sweep")
PREFIX = "plugins/fable5-codex/"
SOURCE_PATHS = tuple(sorted(
    [f"skills/fable-{name}/SKILL.md" for name in SKILLS]
    + ["references/ecf-run-contract.md", "schemas/fable5.schema.json",
       "templates/fable-ecf-run-contract.json", "templates/fable-review-contract.md",
       "templates/sol-ultra.config.toml"]
    + [f"custom-agents/fable-{name}.toml" for name in
       ("explorer", "finder", "fixer", "synthesizer", "verifier")]
))
HARNESS = "domains/agoragentic/harness/"
EVOLVABLE = (HARNESS + "prompts/strategy.md", HARNESS + "prompts/context.md")
DEFAULTS = ("# Strategy\n- trace-callers\n- seek-refutation\n",
            "# Context\n- retain-evidence\n- retain-unknowns\n")
# A deliberately finite initial search space: free-form prompt injection is not
# made safe by an XML delimiter or a regex denylist. Each option is host-owned.
OPTIONS = {
    "strategy": {
        "trace-callers": "Trace callers before drawing a conclusion.",
        "seek-refutation": "Try to refute each candidate finding with source evidence.",
        "test-edge-cases": "Inspect boundary cases within the authorized read-only scope.",
        "prioritize-uncertainty": "Investigate the highest-impact unresolved question first.",
    },
    "context": {
        "retain-evidence": "Retain source references and their qualification in handoffs.",
        "retain-unknowns": "Retain unknowns, refutations and coverage gaps in handoffs.",
        "deduplicate-citations": "Consolidate duplicate citations without losing provenance.",
        "retain-costs": "Retain measured costs and explicit unknown costs in handoffs.",
    },
}
MAX_FILE_BYTES = 256_000
MAX_DIFF_BYTES = 16_384


def digest(data):
    if not isinstance(data, bytes):
        data = json.dumps(data, sort_keys=True, separators=(",", ":"),
                          ensure_ascii=True, allow_nan=False).encode()
    return hashlib.sha256(data).hexdigest()


def full_sha(value, length=40):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{%d}" % length, value):
        raise Denied("exact lowercase digest required")
    return value


def safe_path(value):
    """One portable spelling: no NTFS aliases, ADS, Unicode or dot segments."""
    if not isinstance(value, str) or not value or len(value) > 240:
        raise Denied("invalid path")
    parts = value.split("/")
    for part in parts:
        if (not re.fullmatch(r"[A-Za-z0-9_.-]+", part) or part in (".", "..")
                or part.endswith((".", " ")) or part.lower() == ".git"
                or re.fullmatch(r"(?i)(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?", part)):
            raise Denied("nonportable path")
    return value


def no_links(path):
    path = Path(os.path.abspath(path))
    for part in (path, *path.parents):
        if part.exists() or part.is_symlink():
            info = part.lstat()
            if (stat.S_ISLNK(info.st_mode)
                    or getattr(info, "st_file_attributes", 0) & 0x400):
                raise Denied("symlink or reparse point")
    return path


def git(repo, *args):
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("GIT_")}
    env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
               GIT_TERMINAL_PROMPT="0", GIT_ATTR_NOSYSTEM="1")
    result = subprocess.run(
        ["git", "--no-replace-objects", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=" + os.devnull,
         "-c", "core.autocrlf=false", "-C", str(repo), *args],
        env=env, capture_output=True, timeout=30, check=False)
    if result.returncode:
        raise Denied("git operation failed: " + args[0])
    return result.stdout


def tree(repo, commit):
    full_sha(commit)
    entries, aliases = {}, {}
    for record in git(repo, "ls-tree", "-rz", "--full-tree", commit).split(b"\0"):
        if not record:
            continue
        metadata, raw_path = record.split(b"\t", 1)
        mode, kind, blob = metadata.decode("ascii").split()
        path = safe_path(raw_path.decode("utf-8"))
        parts = path.split("/")
        for index in range(1, len(parts) + 1):
            prefix = "/".join(parts[:index])
            key = prefix.casefold()
            if key in aliases and aliases[key] != prefix:
                raise Denied("case alias")
            aliases[key] = prefix
        if mode not in ("100644", "100755") or kind != "blob":
            raise Denied("unsupported file mode or submodule")
        entries[path] = {"mode": mode, "blob": blob}
    return entries


def blob_bytes(repo, entry):
    if int(git(repo, "cat-file", "-s", entry["blob"])) > MAX_FILE_BYTES:
        raise Denied("oversized source file")
    return git(repo, "cat-file", "blob", entry["blob"])


def clean(repo, commit):
    repo = no_links(repo)
    if Path(git(repo, "rev-parse", "--show-toplevel").decode().strip()).resolve() != repo.resolve():
        raise Denied("repository root required")
    if git(repo, "rev-parse", "HEAD").decode().strip() != full_sha(commit):
        raise Denied("HEAD differs from expected commit")
    if git(repo, "status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"):
        raise Denied("dirty repository")
    return repo


def validate_fragment(path, data):
    kind = Path(path).stem
    if path not in EVOLVABLE or len(data) > 2048:
        raise Denied("fragment outside scope")
    try:
        text = data.decode("ascii")
    except UnicodeError as error:
        raise Denied("fragment must be ASCII") from error
    lines = text.splitlines()
    if not lines or lines[0] != "# " + kind.title() or not text.endswith("\n") or "\r" in text:
        raise Denied("invalid fragment header or line ending")
    chosen = [line[2:] for line in lines[1:] if line.startswith("- ")]
    if (len(chosen) != len(lines) - 1 or not 1 <= len(chosen) <= 4
            or len(set(chosen)) != len(chosen) or any(x not in OPTIONS[kind] for x in chosen)):
        raise Denied("unsupported prompt option")
    return [OPTIONS[kind][option] for option in chosen]


def export_baseline(source_repo, source_commit, destination):
    """Create a new sanitized repo from Git blobs, not a recursive working copy.

    Caller must have reviewed source_commit. The result attests bytes only;
    export does not assert owner approval or execution authority.
    """
    source_repo = clean(source_repo, source_commit)
    destination = no_links(destination)
    if destination.exists() or source_repo == destination or source_repo in destination.parents:
        raise Denied("destination must be new and outside source repository")
    entries = tree(source_repo, source_commit)
    prepared, manifest_files = {}, {}
    for relative in SOURCE_PATHS:
        source_path = PREFIX + relative
        if source_path not in entries or entries[source_path]["mode"] != "100644":
            raise Denied("missing or executable protected source")
        data = blob_bytes(source_repo, entries[source_path])
        # Reject skip-worktree/assume-unchanged drift that status can hide.
        file_path = no_links(source_repo / source_path)
        if not file_path.is_file() or file_path.read_bytes().replace(b"\r\n", b"\n") != data.replace(b"\r\n", b"\n"):
            raise Denied("protected working-copy drift")
        output_path = HARNESS + "base/" + relative
        prepared[output_path] = data
        manifest_files[output_path] = {"sha256": digest(data), "mode": "100644",
                                       "source_path": source_path, "source_blob": entries[source_path]["blob"]}
    for path, content in zip(EVOLVABLE, DEFAULTS):
        prepared[path] = content.encode()
        manifest_files[path] = {"sha256": digest(prepared[path]), "mode": "100644"}
    snapshot = {"schema": "fable-rrsi-snapshot-v1", "source_commit": source_commit,
                "source_tree": git(source_repo, "rev-parse", source_commit + "^{tree}").decode().strip(),
                "files": manifest_files, "evolvable": list(EVOLVABLE)}
    snapshot_bytes = (json.dumps(snapshot, sort_keys=True, indent=2) + "\n").encode()
    # All validation precedes output writes. Partial I/O failures remain explicit.
    clean(source_repo, source_commit)
    destination.mkdir(parents=True)
    for path, data in {**prepared, "snapshot.json": snapshot_bytes}.items():
        target = destination / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    git(destination, "init", "--quiet")
    git(destination, "add", "--", "snapshot.json", "domains/agoragentic/harness")
    git(destination, "-c", "user.name=RRSI source export", "-c", "user.email=source-export@invalid",
        "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Freeze sanitized Fable baseline")
    return {"baseline_commit": git(destination, "rev-parse", "HEAD").decode().strip(),
            "snapshot_sha256": digest(snapshot_bytes), "source_commit": source_commit,
            "authority": False, "execution": False}


def verify_baseline(repo, baseline_commit, snapshot_sha256):
    entries = tree(repo, baseline_commit)
    if "snapshot.json" not in entries:
        raise Denied("missing snapshot")
    raw = blob_bytes(repo, entries["snapshot.json"])
    if digest(raw) != full_sha(snapshot_sha256, 64):
        raise Denied("snapshot does not match host anchor")
    snapshot = json.loads(raw)
    expected = {HARNESS + "base/" + p for p in SOURCE_PATHS} | set(EVOLVABLE)
    if (snapshot.get("schema") != "fable-rrsi-snapshot-v1"
            or snapshot.get("evolvable") != list(EVOLVABLE)
            or set(snapshot.get("files", {})) != expected
            or set(entries) != expected | {"snapshot.json"}):
        raise Denied("snapshot scope mismatch")
    for path in entries:
        if entries[path]["mode"] != "100644":
            raise Denied("executable baseline")
        if path != "snapshot.json" and digest(blob_bytes(repo, entries[path])) != snapshot["files"][path]["sha256"]:
            raise Denied("snapshot byte mismatch")
    return entries


def atoms(path, before, after):
    """One tag per line-level replacement, insertion or deletion, not per file."""
    old, new = before.decode().splitlines(keepends=True), after.decode().splitlines(keepends=True)
    result = []
    for opcode, i, j, a, b in difflib.SequenceMatcher(a=old, b=new, autojunk=False).get_opcodes():
        if opcode == "equal":
            continue
        for offset in range(max(j - i, b - a)):
            atom = {"path": path, "old_line": i + offset + 1, "new_line": a + offset + 1,
                    "before": old[i + offset] if i + offset < j else "",
                    "after": new[a + offset] if a + offset < b else ""}
            result.append({"diff_sha256": digest(atom), "component": "prompt", **atom})
    return result


def inspect_candidate(repo, baseline_commit, candidate_commit, snapshot_sha256):
    repo = clean(repo, candidate_commit)
    baseline = verify_baseline(repo, baseline_commit, snapshot_sha256)
    candidate = tree(repo, candidate_commit)
    if set(candidate) != set(baseline):
        raise Denied("added, removed, renamed or hidden paths")
    if git(repo, "merge-base", baseline_commit, candidate_commit).decode().strip() != baseline_commit:
        raise Denied("candidate is not descended from baseline")
    edits, manifest, patches = [], {}, []
    for path, entry in candidate.items():
        if entry["mode"] != baseline[path]["mode"]:
            raise Denied("file mode changed")
        data = blob_bytes(repo, entry)
        actual = no_links(repo / path)
        if not actual.is_file() or actual.read_bytes() != data:
            raise Denied("candidate working-copy drift")
        if os.name != "nt" and bool(actual.stat().st_mode & 0o111) != (entry["mode"] == "100755"):
            raise Denied("candidate filesystem mode drift")
        if path not in EVOLVABLE and entry != baseline[path]:
            raise Denied("protected source changed")
        if path in EVOLVABLE:
            validate_fragment(path, data)
            before = blob_bytes(repo, baseline[path])
            edits += atoms(path, before, data)
            # Canonical unified bytes come from verified blobs, independent of
            # local Git diff algorithms, context, attributes, prefixes or color.
            patches.extend(difflib.unified_diff(
                before.decode("ascii").splitlines(keepends=True),
                data.decode("ascii").splitlines(keepends=True),
                fromfile="a/" + path, tofile="b/" + path, n=3, lineterm="\n"))
        manifest[path] = {"sha256": digest(data), "mode": entry["mode"], "blob": entry["blob"]}
    # Includes ignored files and physical case aliases; do not trust status alone.
    found = set()
    for directory, dirs, names in os.walk(repo, followlinks=False):
        if Path(directory) == repo:
            dirs[:] = [d for d in dirs if d != ".git"]
        for name in dirs + names:
            no_links(Path(directory) / name)
        for name in dirs:
            relative = (Path(directory) / name).relative_to(repo).as_posix()
            if not any(path.startswith(relative + "/") for path in candidate):
                raise Denied("unknown candidate directory")
        for name in names:
            path = (Path(directory) / name).relative_to(repo).as_posix()
            if path == ".git":
                continue
            safe_path(path)
            found.add(path)
    if found != set(candidate):
        raise Denied("untracked or ignored candidate content")
    patch = "".join(patches).encode("ascii")
    if len(patch) > MAX_DIFF_BYTES:
        raise Denied("diff exceeds byte budget")
    clean(repo, candidate_commit)
    return {"schema": "fable-rrsi-source-v1", "baseline_commit": baseline_commit,
            "candidate_commit": candidate_commit, "snapshot_sha256": snapshot_sha256,
            "baseline_tree": git(repo, "rev-parse", baseline_commit + "^{tree}").decode().strip(),
            "candidate_tree": git(repo, "rev-parse", candidate_commit + "^{tree}").decode().strip(),
            "diff_sha256": digest(patch), "diff_bytes": len(patch), "files": manifest,
            "edit_atoms": edits, "structural_novelty": 0, "authority": False}


def bind_candidate(repo, baseline_commit, candidate_commit, snapshot_sha256, declared_edits, edit_budget):
    if type(edit_budget) is not int or not 1 <= edit_budget <= 16:
        raise Denied("invalid edit budget")
    packet = inspect_candidate(repo, baseline_commit, candidate_commit, snapshot_sha256)
    actual = packet["edit_atoms"]
    if not isinstance(declared_edits, list) or not 0 < len(actual) == len(declared_edits) <= edit_budget:
        raise Denied("edit budget or coverage mismatch")
    tags, hypotheses = {}, set()
    for edit in declared_edits:
        if not isinstance(edit, dict) or set(edit) != {"diff_sha256", "component", "hypothesis_id", "hypothesis"}:
            raise Denied("invalid edit declaration")
        if (edit["component"] != "prompt" or not isinstance(edit["hypothesis_id"], str)
                or not re.fullmatch(r"hyp-[a-z0-9-]{1,64}", edit["hypothesis_id"])
                or not isinstance(edit["hypothesis"], str) or not 10 <= len(edit["hypothesis"].strip()) <= 512
                or not isinstance(edit["diff_sha256"], str)
                or edit["diff_sha256"] in tags or edit["hypothesis_id"] in hypotheses):
            raise Denied("invalid or duplicate hypothesis binding")
        tags[edit["diff_sha256"]] = edit["hypothesis_id"]
        hypotheses.add(edit["hypothesis_id"])
    if set(tags) != {edit["diff_sha256"] for edit in actual}:
        raise Denied("declared edits differ from actual diff")
    packet["edits"] = [{"diff_sha256": e["diff_sha256"], "component": "prompt",
                        "hypothesis_id": tags[e["diff_sha256"]]} for e in actual]
    del packet["edit_atoms"]  # public packet carries opaque references, not private hypothesis prose
    packet["packet_sha256"] = digest(packet)
    return packet


def compose(repo, baseline_commit, candidate_commit, snapshot_sha256, skill):
    if skill not in SKILLS:
        raise Denied("unknown workflow")
    inspect_candidate(repo, baseline_commit, candidate_commit, snapshot_sha256)
    entries = tree(repo, candidate_commit)
    # Return separate channels. Nothing supplied by the candidate is concatenated
    # ahead of or into the governing workflow. No file is installed or executed.
    protected = ["references/ecf-run-contract.md", f"skills/fable-{skill}/SKILL.md"]
    return {"governing_documents": [blob_bytes(repo, entries[HARNESS + "base/" + p]).decode()
                                    for p in protected],
            "bounded_suggestions": [item for p in EVOLVABLE
                                    for item in validate_fragment(p, blob_bytes(repo, entries[p]))],
            "instruction_precedence": "governing_documents_then_host_owned_suggestions",
            "model_settings": "unchanged_from_frozen_base", "execution": False}
