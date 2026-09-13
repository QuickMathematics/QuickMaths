#!/usr/bin/env python3
"""Compute import-root closure and packed-artifact costs without compiling."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / ".bridge-runtime" / "curated-formal" / "corpus.json"
VIABILITY = ROOT / ".bridge-runtime" / "curated-formal" / "assets-native-eh-tail" / "viability.json"
DEFAULT_JSON = ROOT / "experiments" / "browser-lean" / "results" / "parity" / "import-costs.json"
DEFAULT_REPORT = ROOT / "docs" / "releases" / "2026-09-13-formal-import-costs.md"


def closure(roots: list[str], graph: dict[str, list[str]]) -> set[str]:
    seen: set[str] = set()
    todo = list(dict.fromkeys(["Init", *roots]))
    while todo:
        module = todo.pop()
        if module in seen:
            continue
        seen.add(module)
        todo.extend(graph.get(module, []))
    return seen


def module_from_path(path: str) -> tuple[str, str] | None:
    for suffix, kind in ((".olean", "olean"), (".ir.sig", "ir_sig"), (".ir", "ir")):
        if path.endswith(suffix):
            return path[:-len(suffix)].replace("/", "."), kind
    return None


def format_bytes(value: int) -> str:
    return f"{value:,}"


def build(corpus: dict, viability: dict) -> dict:
    graph = corpus["graph"]
    profiles = corpus["profiles"]
    if set(profiles) != set(viability["profiles"]):
        raise ValueError("Corpus/viability profile sets differ")

    artifacts: dict[str, dict[str, int]] = {}
    module_packs: dict[str, dict[str, int]] = {}
    pack_sizes: dict[str, int] = {}
    for pack in viability["packs"]:
        pack_sizes[pack["file"]] = pack["compressedBytes"]
        for entry in pack["entries"]:
            parsed = module_from_path(entry["path"])
            if not parsed:
                raise ValueError(f"Unexpected pack entry: {entry['path']}")
            module, kind = parsed
            if module in artifacts and kind in artifacts[module]:
                raise ValueError(f"Duplicate artifact: {module}.{kind}")
            artifacts.setdefault(module, {})[kind] = entry["bytes"]
            module_packs.setdefault(module, {})[pack["file"]] = pack["compressedBytes"]

    required_kinds = {"olean", "ir", "ir_sig"}
    missing = {m: sorted(required_kinds - set(a)) for m, a in artifacts.items() if set(a) != required_kinds}
    if missing:
        raise ValueError(f"Incomplete module artifact triplets: {list(missing)[:3]}")
    module_raw = {m: sum(a.values()) for m, a in artifacts.items()}

    profile_closures: dict[str, set[str]] = {}
    for profile_id, profile in profiles.items():
        roots = profile["imports"]
        if any(root not in graph for root in roots):
            raise ValueError(f"Direct import absent from graph in {profile_id}")
        actual = closure(roots, graph)
        expected = set(profile["modules"])
        if actual != expected:
            raise ValueError(
                f"Closure mismatch for {profile_id}: missing={len(expected - actual)} extra={len(actual - expected)}"
            )
        profile_closures[profile_id] = actual

    common = set.intersection(*profile_closures.values())

    def pack_cost(modules: set[str]) -> tuple[int, int, list[str]]:
        packs = {pack for module in modules for pack in module_packs[module]}
        compressed = sum(pack_sizes[pack] for pack in packs)
        return len(packs), compressed, sorted(packs)

    def largest(modules: set[str]) -> list[dict]:
        return [
            {"module": m, "rawBytes": module_raw[m], "olean": artifacts[m]["olean"],
             "ir": artifacts[m]["ir"], "irSig": artifacts[m]["ir_sig"]}
            for m in sorted(modules, key=lambda item: (-module_raw[item], item))[:5]
        ]

    result_profiles = {}
    pack_union_matches_manifest = True
    for profile_id, profile in profiles.items():
        all_modules = profile_closures[profile_id]
        profile_packs, profile_pack_bytes, profile_pack_names = pack_cost(all_modules)
        manifest_pack_names = sorted(pack["file"] for pack in viability["packs"] if profile_id in pack.get("profiles", []))
        manifest_pack_bytes = sum(pack_sizes[pack] for pack in manifest_pack_names)
        if profile_pack_names != manifest_pack_names or profile_pack_bytes != manifest_pack_bytes:
            raise ValueError(f"Pack union mismatch for {profile_id}")
        root_rows = []
        for root in profile["imports"]:
            root_modules = closure([root], graph)
            other_modules = closure([r for r in profile["imports"] if r != root], graph)
            marginal_modules = root_modules - other_modules
            above_common = root_modules - common
            touched_packs, touched_pack_bytes, pack_names = pack_cost(root_modules)
            marginal_packs, marginal_pack_bytes, marginal_pack_names = pack_cost(marginal_modules)
            remaining_packs, _, remaining_pack_names = pack_cost(other_modules)
            removable_pack_names = sorted(set(pack_names) - set(remaining_pack_names))
            removable_pack_bytes = sum(pack_sizes[pack] for pack in removable_pack_names)
            root_rows.append({
                "root": root,
                "inclusive": {
                    "moduleCount": len(root_modules), "rawBytes": sum(module_raw[m] for m in root_modules),
                    "packCount": touched_packs, "compressedPackBytes": touched_pack_bytes,
                    "packs": pack_names,
                },
                "exclusiveMarginal": {
                    "moduleCount": len(marginal_modules), "rawBytes": sum(module_raw[m] for m in marginal_modules),
                    "packsTouchedByExclusiveModules": marginal_packs,
                    "compressedPackBytesTouchedByExclusiveModules": marginal_pack_bytes,
                    "packs": marginal_pack_names,
                },
                "removableOnRootRemoval": {
                    "packCount": len(removable_pack_names), "compressedPackBytes": removable_pack_bytes,
                    "packs": removable_pack_names,
                },
                "growthAboveCommonAlgebra": {
                    "moduleCount": len(above_common), "rawBytes": sum(module_raw[m] for m in above_common),
                },
                "largestArtifactModules": largest(root_modules),
            })
        result_profiles[profile_id] = {
            "directImports": profile["imports"],
            "moduleCount": len(all_modules), "rawBytes": sum(module_raw[m] for m in all_modules),
            "packCount": profile_packs, "compressedPackBytes": profile_pack_bytes,
            "commonAlgebraModuleCount": len(common),
            "commonAlgebraRawBytes": sum(module_raw[m] for m in common),
            "growthAboveCommonAlgebra": {
                "moduleCount": len(all_modules - common), "rawBytes": sum(module_raw[m] for m in all_modules - common),
            },
            "rootCosts": root_rows,
        }

    return {
        "schemaVersion": 1,
        "verification": {
            "profileCount": len(profiles), "allProfileClosuresMatchDeclaredModules": True,
            "allProfilePackUnionsMatchManifest": pack_union_matches_manifest,
            "implicitInitIncluded": True, "commonAlgebraDefinition": "intersection of all five profile closures",
        },
        "commonAlgebra": {"moduleCount": len(common), "rawBytes": sum(module_raw[m] for m in common), "modules": sorted(common)},
        "profiles": result_profiles,
    }


def report(result: dict) -> str:
    lines = [
        "# Formal import-cost analysis (2026-09-13)", "",
        "This is a static closure-and-artifact accounting report for all five curated profiles.",
        "`Init` is included implicitly, as in `corpus-closure.py`. Raw bytes sum each module’s",
        "`.olean`, `.ir`, and `.ir.sig` files. Compressed costs charge the complete shared pack",
        "whenever any module in that pack is touched; they are not per-declaration serialized sizes.", "",
        "## Verification", "",
        f"- Profiles analyzed: **{result['verification']['profileCount']}**.",
        "- Every computed graph union exactly matches its declared `profile.modules` set.",
        "- Every computed profile pack union and compressed-byte total exactly matches the manifest’s packs assigned to that profile.",
        f"- Corpus SHA-256: `{result['source']['corpusSha256']}`; viability/config SHA-256: `{result['source']['viabilitySha256']}`.",
        f"- Common algebra baseline (intersection of all five closures): **{result['commonAlgebra']['moduleCount']:,} modules / {format_bytes(result['commonAlgebra']['rawBytes'])} raw bytes**.", "",
        "## Profile totals", "",
        "| Profile | Modules | Raw bytes | Touched packs | Compressed pack bytes | Growth above common algebra |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for profile_id, p in result["profiles"].items():
        growth = p["growthAboveCommonAlgebra"]
        lines.append(f"| `{profile_id}` | {p['moduleCount']:,} | {format_bytes(p['rawBytes'])} | {p['packCount']:,} | {format_bytes(p['compressedPackBytes'])} | {growth['moduleCount']:,} modules / {format_bytes(growth['rawBytes'])} bytes |")
    for profile_id, p in result["profiles"].items():
        lines += ["", f"## Direct imports: `{profile_id}`", "", "| Root | Inclusive closure | Exclusive marginal modules | Above common algebra | Packs touched by exclusive modules | Packs removable on root removal | Largest artifact modules |", "|---|---:|---:|---:|---:|---:|---|"]
        for row in p["rootCosts"]:
            inc, marginal, growth = row["inclusive"], row["exclusiveMarginal"], row["growthAboveCommonAlgebra"]
            removable = row["removableOnRootRemoval"]
            largest = "; ".join(f"`{x['module']}` ({format_bytes(x['rawBytes'])})" for x in row["largestArtifactModules"][:3])
            lines.append(
                f"| `{row['root']}` | {inc['moduleCount']:,} modules / {format_bytes(inc['rawBytes'])} bytes | "
                f"{marginal['moduleCount']:,} modules / {format_bytes(marginal['rawBytes'])} bytes | "
                f"{growth['moduleCount']:,} modules / {format_bytes(growth['rawBytes'])} bytes | "
                f"{marginal['packsTouchedByExclusiveModules']:,} packs / {format_bytes(marginal['compressedPackBytesTouchedByExclusiveModules'])} bytes | "
                f"{removable['packCount']:,} packs / {format_bytes(removable['compressedPackBytes'])} bytes | {largest} |"
            )
        lines += ["", "Marginal means the root’s reachable module set minus the closure retained by the other direct roots. The first pack column charges every pack touched by those exclusive modules; the second is the actually removable pack set (profile packs minus packs still touched by remaining roots). Inclusive rows overlap by design; summing them is not a profile total."]
    lines += ["", "## Interpretation", "", "The numbers support profile-level and root-level cost decisions only. They do not claim per-declaration or per-proof serialized-byte precision. A root can have a small exclusive module marginal while still touching a large shared pack, and a profile’s compressed download is the union of its touched packs."]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--viability", type=Path, default=VIABILITY)
    parser.add_argument("--output", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    corpus = json.loads(args.corpus.read_text(encoding="utf-8"))
    viability = json.loads(args.viability.read_text(encoding="utf-8"))
    result = build(corpus, viability)
    result["source"] = {
        "corpus": str(args.corpus), "corpusSha256": hashlib.sha256(args.corpus.read_bytes()).hexdigest(),
        "viability": str(args.viability), "viabilitySha256": hashlib.sha256(args.viability.read_bytes()).hexdigest(),
        "packGranularity": True,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(report(result), encoding="utf-8")
    print(json.dumps({"profiles": len(result["profiles"]), "output": str(args.output), "report": str(args.report)}, indent=2))


if __name__ == "__main__":
    main()
