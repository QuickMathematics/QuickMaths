#!/usr/bin/env python3
"""Derive the compact Lean WASM export list from the staged native objects.

This runs before the final Emscripten link.  It intentionally exports only the
runtime ABI, initializer entrypoints, and boxed interpreter dispatch symbols;
ordinary implementation symbols remain available through shipped IR.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path


BOXED = re.compile(r"^_?l_.+___boxed$")
DATA_TYPES = {"D", "B", "R"}
STARTUP_ABI = {
    "_lean_io_mark_end_initialization",
    "_lean_io_result_show_error",
    "_lean_initialize",
    "_lean_initialize_runtime_module",
    "_lean_init_search_path",
    "_lean_mk_string",
    "_lean_wasm_compile",
    "_main",
    "_malloc",
    "_free",
}


def nm_record(line: str) -> tuple[str, str] | None:
    fields = line.split()
    if len(fields)<2 or fields[0].endswith(':'):
        return None
    # llvm-nm --format=posix is name type value size on the pinned toolchain.
    name = fields[0]
    type_field = fields[1]
    if len(type_field)!=1 or not type_field.isupper() or type_field=='U':return None
    # Clang renames C main; Emscripten link.py maps EXPORTED_FUNCTIONS['_main']
    # to this actual entry point. Require that the object really defines it.
    if name=='__main_argc_argv':return '_main',type_field
    # llvm-nm reports raw WASM/C symbol names, not Emscripten's leading-underscore API.
    return '_'+name, type_field


REQUIRED = {
    "_free",
    "_main",
    "_malloc",
}


def keep(name: str, symbol_type: str) -> bool:
    return (
        name in REQUIRED
        or name.startswith("_lean_")
        or name.startswith("_initialize_")
        or bool(BOXED.match(name))
        or (name.startswith("_l_") and symbol_type in DATA_TYPES)
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage1", type=Path, help="stage1 directory containing final link inputs")
    parser.add_argument("output", type=Path, help="Emscripten EXPORTED_FUNCTIONS file")
    parser.add_argument("--llvm-nm", default="llvm-nm")
    parser.add_argument("--require-snapshot", action="store_true")
    parser.add_argument("--metadata", type=Path)
    args = parser.parse_args()

    # Match stdlib.make's lean executable link exactly. Lake, Leanc and LeanIR
    # are separate executables: their exports must not leak into this manifest.
    inputs=[args.stage1/p for p in [
        'lib/temp/libleanmain.a','lib/temp/libleanshell.a',
        'lib/lean/libleancpp.a','lib/lean/libInit.a','lib/lean/libStd.a',
        'lib/lean/libLean.a','lib/lean/libleanrt.a',
    ]]
    missing_inputs=[str(p) for p in inputs if not p.is_file()]
    if missing_inputs:parser.error('Missing actual Lean link archives: '+', '.join(missing_inputs))

    # These are supplied by Emscripten libc at link time, not Lean's archives.
    names: set[str] = {'_malloc','_free'}
    for path in inputs:
        command = [args.llvm_nm, "--defined-only", "--extern-only", "--format=posix"]
        command.append(str(path))
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
        for line in result.stdout.splitlines():
            record = nm_record(line)
            if record and keep(*record):
                name, _ = record
                names.add(name)

    ordered = sorted(names)
    required = STARTUP_ABI | ({"_lean_wasm_load_snapshot"} if args.require_snapshot else set())
    missing = sorted(required - names)
    if missing:
        parser.error("required startup ABI symbols missing from link inputs: " + ", ".join(missing))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(ordered) + "\n", encoding="utf-8")
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    if args.metadata:
        args.metadata.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "stage1": str(args.stage1),
                    "inputCount": len(inputs),
                    "symbolCount": len(ordered),
                    "sha256": digest,
                    "classes": {
                        "runtime": sum(n.startswith("_lean_") for n in ordered),
                        "initializers": sum(n.startswith("_initialize_") for n in ordered),
                        "boxed": sum(bool(BOXED.match(n)) for n in ordered),
                        "entrypoints": sum(n in REQUIRED for n in ordered),
                    },
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    print(f"wrote {len(ordered)} exports to {args.output} ({digest})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
