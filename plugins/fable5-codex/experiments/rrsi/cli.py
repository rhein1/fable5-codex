"""Explicit offline source operations. This CLI has no execute/install command."""
import argparse
import json
from pathlib import Path
import sys
import subprocess

sys.path.insert(0, str(Path(__file__).resolve().parent))
from source import Denied, bind_candidate, compose, export_baseline, inspect_candidate


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, _message):
        # argparse's default errors include rejected argument values. Preserve
        # parser exit status without disclosing caller paths or private text.
        self.exit(2, "source_operation_denied\n")


def main():
    parser = SafeArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)
    snapshot = commands.add_parser("snapshot")
    snapshot.add_argument("--source", required=True)
    snapshot.add_argument("--commit", required=True)
    snapshot.add_argument("--destination", required=True)
    for name in ("inspect", "bind", "compose"):
        command = commands.add_parser(name)
        command.add_argument("--repo", required=True)
        command.add_argument("--baseline", required=True)
        command.add_argument("--candidate", required=True)
        command.add_argument("--snapshot-sha256", required=True)
        if name == "bind":
            command.add_argument("--edits", required=True)
            command.add_argument("--edit-budget", required=True, type=int)
        if name == "compose":
            command.add_argument("--skill", required=True)
    args = parser.parse_args()
    try:
        if args.operation == "snapshot":
            result = export_baseline(args.source, args.commit, args.destination)
        else:
            binding = (args.repo, args.baseline, args.candidate, args.snapshot_sha256)
            if args.operation == "inspect":
                result = inspect_candidate(*binding)
            elif args.operation == "compose":
                result = compose(*binding, args.skill)
            else:
                with Path(args.edits).open("rb") as edits_file:
                    raw = edits_file.read(32_769)
                if len(raw) > 32_768:
                    raise Denied("edit input too large")
                result = bind_candidate(*binding, json.loads(raw), args.edit_budget)
        print(json.dumps(result, sort_keys=True, indent=2, allow_nan=False))
        return 0
    except (Denied, OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired):
        # Do not echo caller paths, raw private hypotheses or source contents.
        print("source_operation_denied", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
