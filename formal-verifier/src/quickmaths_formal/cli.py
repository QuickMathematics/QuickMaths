from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .authoring import build_proposition_request, parse_variable_declarations
from .contract import ContractError, normalize_request
from .lean import render_request
from .search import search_proof
from .service import run_server
from .state import inspect_request
from .verifier import prove_goal, replay_certificate, result_to_json, verify_request


def _load(path: str):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _print_json(value) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="qm-formal", description="QuickMaths typed Lean-backed formal verifier")
    parser.add_argument("--project-dir", default=str(Path(__file__).resolve().parents[2]))
    sub = parser.add_subparsers(dest="command", required=True)

    check = sub.add_parser("check", help="Validate and, when Lean is available, verify submitted typed steps")
    check.add_argument("request")

    prove = sub.add_parser("prove", help="Run bounded candidate search and kernel-check the generated proof when Lean is available")
    prove.add_argument("request")

    prove_text = sub.add_parser("prove-text", help="Attempt a proposition written in constrained school notation")
    prove_text.add_argument("goal")
    prove_text.add_argument("--var", dest="variables", action="append", default=[], help="Declare name:type, e.g. x:real")
    prove_text.add_argument("--assume", dest="assumptions", action="append", default=[], help="Add one assumption, e.g. 'x != 3'")
    prove_text.add_argument("--rule", dest="rules", action="append", default=[], help="Restrict search to a rule; repeatable")
    prove_text.add_argument("--request-id", default="cli-proof")

    search = sub.add_parser("search", help="Show untrusted proof candidates/counterexamples without certifying them")
    search.add_argument("request")

    inspect = sub.add_parser("inspect", help="Show canonical statement, domain requirements, obligations and candidate search")
    inspect.add_argument("request")

    render = sub.add_parser("render", help="Render the deterministic Lean artifact without trusting it")
    render.add_argument("request")

    replay = sub.add_parser("replay", help="Check certificate bindings and rerun verification")
    replay.add_argument("request")
    replay.add_argument("certificate")

    serve = sub.add_parser("serve", help="Run the localhost companion verifier service")
    serve.add_argument("--host", default="127.0.0.1", help="Bind host; defaults to loopback only")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--allow-origin", dest="allowed_origins", action="append", default=[], help="Explicit additional browser Origin; repeatable")

    args = parser.parse_args(argv)
    if args.command == "serve":
        try:
            run_server(
                args.host,
                args.port,
                project_dir=args.project_dir,
                allowed_origins=set(args.allowed_origins),
            )
            return 0
        except KeyboardInterrupt:
            return 0
    if args.command == "prove-text":
        try:
            request = build_proposition_request(
                request_id=args.request_id,
                variables=parse_variable_declarations(args.variables),
                goal_text=args.goal,
                assumptions=args.assumptions,
                allowed_rules=args.rules,
            )
        except ContractError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        result = prove_goal(request, project_dir=args.project_dir)
        print(result_to_json(result))
        return 0 if result.status in {"verified", "verification_unavailable", "refuted"} else 1
    if args.command == "render":
        try:
            request = normalize_request(_load(args.request))
            print(render_request(request))
            return 0
        except (ContractError, ValueError) as exc:
            print(str(exc), file=sys.stderr)
            return 2
    if args.command == "search":
        try:
            _print_json(search_proof(_load(args.request)))
            return 0
        except ContractError as exc:
            print(str(exc), file=sys.stderr)
            return 2
    if args.command == "inspect":
        try:
            _print_json(inspect_request(_load(args.request)))
            return 0
        except ContractError as exc:
            print(str(exc), file=sys.stderr)
            return 2
    if args.command == "prove":
        result = prove_goal(_load(args.request), project_dir=args.project_dir)
    elif args.command == "check":
        result = verify_request(_load(args.request), project_dir=args.project_dir)
    else:
        result = replay_certificate(_load(args.request), _load(args.certificate), project_dir=args.project_dir)
    print(result_to_json(result))
    return 0 if result.status in {"verified", "verification_unavailable", "refuted"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
