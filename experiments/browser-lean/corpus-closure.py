#!/usr/bin/env python3
"""Extract the native dependency inventory for the advertised positive corpus.

The extractor derives roots from normalize_request/render_request, parses only
actual Lean header imports, and resolves the graph against the local package
sources plus the installed native Lean toolchain. It never compiles or edits
production files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
from typing import Iterable

ROOT = pathlib.Path(__file__).resolve().parents[2]
FORMAL = ROOT / "formal-verifier"
PACKAGES = FORMAL / ".lake" / "packages"
TOOLCHAIN = ROOT / ".bridge-runtime" / "formal" / "elan" / "toolchains" / "leanprover--lean4---v4.34.0-rc2"
FIXTURES = FORMAL / "fixtures"
PIN_IDS = {
    "lean": "leanprover/lean4:v4.34.0-rc2",
    "mathlib": "42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c",
}

IMPORT_RE = re.compile(r"^\s*(?:(?:public|meta)\s+)*import\s+(?:(?:all)\s+)?([A-Za-z0-9_\.]+)")
HEADER_COMMANDS = {"", "prelude", "module"}


def uncomment(text: str) -> str:
    out: list[str] = []
    i = 0
    depth = 0
    while i < len(text):
        if depth == 0 and text.startswith("/-", i):
            depth, i = 1, i + 2
        elif depth and text.startswith("/-", i):
            depth, i = depth + 1, i + 2
        elif depth and text.startswith("-/", i):
            depth, i = depth - 1, i + 2
        elif depth:
            out.append("\n" if text[i] == "\n" else " ")
            i += 1
        elif text.startswith("--", i):
            while i < len(text) and text[i] != "\n":
                i += 1
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def header_imports(text: str) -> list[str]:
    """Return imports from the module header, excluding commented examples."""
    imports: list[str] = []
    for raw in uncomment(text).splitlines():
        line = raw.strip()
        if line in HEADER_COMMANDS or line.startswith("module "):
            continue
        match = IMPORT_RE.match(raw)
        if match:
            module = match.group(1)
            if module != "all":
                imports.append(module)
            continue
        # Lean module imports are header-only. Stop at the first real command.
        if line.startswith("set_option ") or line.startswith("open "):
            continue
        break
    return list(dict.fromkeys(imports))


def add_tree(base: pathlib.Path, sources: dict[str, pathlib.Path], artifacts: dict[str, dict[str, pathlib.Path]]) -> None:
    if not base.exists():
        return
    for path in base.rglob("*.lean"):
        if ".lake" in path.relative_to(base).parts:
            continue
        module = ".".join(path.relative_to(base).with_suffix("").parts)
        sources.setdefault(module, path)
    lib = base / ".lake" / "build" / "lib" / "lean"
    add_artifacts(lib, artifacts)


def add_artifacts(lib: pathlib.Path, artifacts: dict[str, dict[str, pathlib.Path]]) -> None:
    if not lib.exists():
        return
    suffixes = ((".olean.server", "olean_server"), (".olean.private", "olean_private"),
                (".olean", "olean"), (".ir.sig", "ir_sig"), (".ir", "ir"))
    for path in lib.rglob("*"):
        if not path.is_file():
            continue
        suffix = next((suffix for suffix, _ in suffixes if path.name.endswith(suffix)), None)
        if suffix is None:
            continue
        module = ".".join(path.relative_to(lib).as_posix()[:-len(suffix)].split("/"))
        key = next(key for candidate, key in suffixes if candidate == suffix)
        artifacts.setdefault(module, {})[key] = path


def inventory() -> tuple[dict[str, pathlib.Path], dict[str, dict[str, pathlib.Path]]]:
    sources: dict[str, pathlib.Path] = {}
    artifacts: dict[str, dict[str, pathlib.Path]] = {}
    for name in ["mathlib", "batteries", "aesop", "Qq", "plausible", "LeanSearchClient", "importGraph", "proofwidgets", "Cli"]:
        add_tree(PACKAGES / name, sources, artifacts)
    add_tree(TOOLCHAIN / "src" / "lean", sources, artifacts)
    add_tree(TOOLCHAIN / "src" / "lake", sources, artifacts)
    lib = TOOLCHAIN / "lib" / "lean"
    add_artifacts(lib, artifacts)
    return sources, artifacts


def positive_names() -> tuple[str, ...]:
    # Import the existing acceptance declaration without duplicating its list.
    import sys
    import importlib.util
    sys.path.insert(0, str(FORMAL / "src"))
    spec = importlib.util.spec_from_file_location("kernel_acceptance", FORMAL / "scripts" / "kernel_acceptance.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load kernel_acceptance.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return tuple(module.POSITIVE)


def request_roots(name: str) -> tuple[str, ...]:
    import sys
    sys.path.insert(0, str(FORMAL / "src"))
    from quickmaths_formal.contract import normalize_request
    from quickmaths_formal.lean import render_request

    request = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    rendered = render_request(normalize_request(request))
    return tuple(header_imports(rendered))


def closure(roots: Iterable[str], sources: dict[str, pathlib.Path]) -> tuple[list[str], dict[str, list[str]], list[str]]:
    todo = list(dict.fromkeys(roots)) + ["Init"]  # Lean implicitly imports Init.
    seen: set[str] = set()
    graph: dict[str, list[str]] = {}
    while todo:
        module = todo.pop()
        if module in seen:
            continue
        seen.add(module)
        path = sources.get(module)
        if path is None:
            graph[module] = []
            continue
        deps = header_imports(path.read_text(encoding="utf-8", errors="ignore"))
        graph[module] = deps
        todo.extend(dep for dep in deps if dep not in seen)
    unresolved = sorted(module for module in seen if module not in sources)
    return sorted(seen), graph, unresolved


def artifact_sizes(modules: Iterable[str], artifacts: dict[str, dict[str, pathlib.Path]]) -> dict[str, int]:
    totals = {"olean_bytes": 0, "olean_server_bytes": 0, "olean_private_bytes": 0,
              "ir_bytes": 0, "ir_sig_bytes": 0}
    for module in modules:
        files = artifacts.get(module, {})
        if "olean" in files:
            totals["olean_bytes"] += files["olean"].stat().st_size
        if "olean_server" in files:
            totals["olean_server_bytes"] += files["olean_server"].stat().st_size
        if "olean_private" in files:
            totals["olean_private_bytes"] += files["olean_private"].stat().st_size
        if "ir" in files:
            totals["ir_bytes"] += files["ir"].stat().st_size
            sig = files["ir"].with_suffix(".ir.sig")
            if sig.exists():
                totals["ir_sig_bytes"] += sig.stat().st_size
    return totals


def build() -> dict:
    sources, artifacts = inventory()
    names = positive_names()
    per_fixture = {}
    closure_cache: dict[tuple[str, ...], tuple[list[str], dict[str, list[str]], list[str]]] = {}
    size_cache: dict[tuple[str, ...], dict[str, int]] = {}
    union_roots: set[str] = set()
    union_modules: set[str] = set()
    union_graph: dict[str, list[str]] = {}
    for name in names:
        roots = request_roots(name)
        root_key = tuple(roots)
        if root_key not in closure_cache:
            closure_cache[root_key] = closure(roots, sources)
        modules, graph, unresolved = closure_cache[root_key]
        if root_key not in size_cache:
            size_cache[root_key] = artifact_sizes(modules, artifacts)
        per_fixture[name] = {"roots": list(roots), "modules": modules, "module_count": len(modules), "unresolved": unresolved, "sizes": size_cache[root_key]}
        union_roots.update(roots)
        union_modules.update(modules)
        union_graph.update(graph)
    return {
        "method": "normalize_request/render_request; comment-stripped Lean header parser; ordinary/public/meta/import all; implicit Init seeded",
        "toolchain": str(TOOLCHAIN),
        "pin_ids": PIN_IDS,
        "fixture_count": len(names),
        "fixture_names": list(names),
        "union_roots": sorted(union_roots),
        "union_modules": sorted(union_modules),
        "union_module_count": len(union_modules),
        "union_unresolved": sorted(module for module in union_modules if module not in sources),
        "union_sizes": artifact_sizes(union_modules, artifacts),
        "graph": {module: union_graph[module] for module in sorted(union_graph)},
        "per_fixture": per_fixture,
    }


def compactify(full: dict) -> dict:
    groups: dict[str, dict] = {}
    fixture_index = {}
    for name, item in full["per_fixture"].items():
        digest = hashlib.sha256(("\n".join(item["modules"])).encode()).hexdigest()
        group_id = "closure-" + digest[:16]
        if group_id not in groups:
            groups[group_id] = {
                "hash": digest,
                "modules": item["modules"],
                "module_count": item["module_count"],
                "unresolved": item["unresolved"],
                "sizes": item["sizes"],
                "fixtures": [],
            }
        groups[group_id]["fixtures"].append(name)
        fixture_index[name] = {"group_id": group_id, "roots": item["roots"]}
    return {
        "method": full["method"],
        "pin_ids": full.get("pin_ids", PIN_IDS),
        "fixture_count": full["fixture_count"],
        "fixture_names": full["fixture_names"],
        "groups": {key: groups[key] for key in sorted(groups)},
        "per_fixture": fixture_index,
        "shared_graph": full["graph"],
        "union_roots": full["union_roots"],
        "union_modules": full["union_modules"],
        "union_module_count": full["union_module_count"],
        "union_unresolved": full["union_unresolved"],
        "union_sizes": full["union_sizes"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--compact", action="store_true", help="write deduplicated closure groups")
    args = parser.parse_args()
    result = build()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.compact:
        result = compactify(result)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("fixture_count", "union_module_count", "union_unresolved", "union_sizes")}, indent=2))


if __name__ == "__main__":
    main()
