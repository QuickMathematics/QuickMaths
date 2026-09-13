import pathlib
import re

root = pathlib.Path(__file__).resolve().parents[2]
pkg = root / "formal-verifier" / ".lake" / "packages"
toolchain = root / ".bridge-runtime" / "formal" / "elan" / "toolchains" / "leanprover--lean4---v4.34.0-rc2"
src, olean, ir = {}, {}, {}

def add_tree(base):
    if not base.exists(): return
    for p in base.rglob("*.lean"):
        if ".lake" in p.relative_to(base).parts: continue
        src[".".join(p.relative_to(base).with_suffix("").parts)] = p
    lib = base / ".lake" / "build" / "lib" / "lean"
    if lib.exists():
        for ext, target in ((".olean", olean), (".ir", ir)):
            for p in lib.rglob("*" + ext):
                target[".".join(p.relative_to(lib).with_suffix("").parts)] = p

for name in ["mathlib", "batteries", "aesop", "Qq", "plausible", "LeanSearchClient", "importGraph", "proofwidgets", "Cli"]:
    add_tree(pkg / name)
for name in ["src/lean", "src/lake"]:
    add_tree(toolchain / name)
lib = toolchain / "lib" / "lean"
for ext, target in ((".olean", olean), (".ir", ir)):
    for p in lib.rglob("*" + ext):
        target[".".join(p.relative_to(lib).with_suffix("").parts)] = p

def uncomment(text):
    out, i, depth = [], 0, 0
    while i < len(text):
        if depth == 0 and text.startswith("/-", i): depth, i = 1, i + 2
        elif depth and text.startswith("/-", i): depth, i = depth + 1, i + 2
        elif depth and text.startswith("-/", i): depth, i = depth - 1, i + 2
        elif depth: out.append("\n" if text[i] == "\n" else " "); i += 1
        elif text.startswith("--", i):
            while i < len(text) and text[i] != "\n": i += 1
        else: out.append(text[i]); i += 1
    return "".join(out)

rx = re.compile(r"^\s*(?:(?:public|meta)\s+)*import\s+(?:all\s+)?([A-Za-z0-9_\.]+)")
roots = ["Mathlib.Basic.Real.Basic", "Mathlib.Topology.Defs.Filter", "Mathlib.Tactic.FieldSimp", "Mathlib.Tactic.Ring", "Mathlib.Tactic.Linarith", "Mathlib.Tactic.NormNum", "Mathlib.Tactic.Positivity", "Mathlib.Analysis.Calculus.Deriv.Abs", "Mathlib.Analysis.SpecialFunctions.ExpDeriv", "Mathlib.Analysis.SpecialFunctions.Log.Deriv", "Mathlib.Analysis.SpecialFunctions.Sqrt", "Mathlib.Analysis.SpecialFunctions.Pow.Real", "Mathlib.Analysis.SpecialFunctions.Trigonometric.Deriv", "Mathlib.Analysis.SpecificLimits.Normed", "Mathlib.Analysis.PSeries", "Mathlib.Analysis.Polynomial.Basic", "Mathlib.Topology.Order.IntermediateValue", "Mathlib.Tactic.FunProp", "Mathlib.Tactic.Convert", "Mathlib.Tactic.GCongr", "Mathlib.Tactic.FinCases", "Mathlib.Tactic.Continuity", "Mathlib.Tactic.NormNum.RealSqrt"]
guarded = roots[:7]

def closure(start):
    todo, seen = list(start) + ["Init"], set()
    while todo:
        m = todo.pop()
        if m in seen: continue
        seen.add(m)
        p = src.get(m)
        if p is None: continue
        for line in uncomment(p.read_text(encoding="utf-8", errors="ignore")).splitlines():
            z = rx.match(line)
            if z: todo.append(z.group(1))
    om = [m for m in seen if m in olean]
    im = [m for m in seen if m in ir]
    return {"modules_seen": len(seen), "modules": sorted(seen), "compiled_olean_modules": len(om), "olean_bytes": sum(olean[m].stat().st_size for m in om), "ir_bytes": sum(ir[m].stat().st_size for m in im), "ir_sig_bytes": sum(ir[m].with_suffix('.ir.sig').stat().st_size for m in im if ir[m].with_suffix('.ir.sig').exists()), "unresolved_source_modules": sorted(m for m in seen if m not in src), "uncompiled_modules": sorted(m for m in seen if m not in olean)}

all_result = closure(roots)
guarded_result = closure(guarded)
out = root / ".bridge-runtime" / "lean-browser" / "native-closures.json"
out.write_text(__import__("json").dumps({"method": "comment-stripped ordinary/public/meta import graph plus installed Lean toolchain source; implicit Init seeded", "all_roots": all_result, "guarded_cancellation": guarded_result}, indent=2) + "\n", encoding="utf-8")
for name, result in (("all_roots", all_result), ("guarded_cancellation", guarded_result)):
    print(name, {k: v for k, v in result.items() if k not in ("modules", "olean_modules")})
