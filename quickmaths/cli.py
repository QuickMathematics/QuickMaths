from __future__ import annotations

import argparse
import sys
from pathlib import Path

from quickmaths.config import DEFAULT_TRACK_DIR
from quickmaths.local_bridge import LocalBridgeError, add_agent_bridge_parser, run_agent_bridge_from_args
from quickmaths.validation import validate_curriculum


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="quickmaths")
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate_parser = subparsers.add_parser("validate-content", help="Validate curriculum YAML and generated tests.")
    validate_parser.add_argument("--track-dir", type=Path, default=DEFAULT_TRACK_DIR)
    validate_parser.add_argument("--no-dry-run", action="store_true", help="Skip generated problem dry-runs.")
    validate_parser.add_argument("--strict-warnings", action="store_true", help="Return a failing exit code for warnings.")
    validate_parser.add_argument("--include-drafts", action="store_true", help="Validate draft skills and track-local drafts directory.")
    add_agent_bridge_parser(subparsers)
    args = parser.parse_args(argv)

    if args.command == "validate-content":
        report = validate_curriculum(args.track_dir, dry_run_generated=not args.no_dry_run, include_drafts=args.include_drafts)
        for line in report.lines():
            print(line)
        if report.errors or (args.strict_warnings and report.warnings):
            return 1
        return 0
    if args.command == "agent-bridge":
        try:
            return run_agent_bridge_from_args(args)
        except LocalBridgeError as error:
            print(f"QuickMaths Bridge could not start: {error}", file=sys.stderr)
            return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
