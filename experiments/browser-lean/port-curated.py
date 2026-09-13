"""Extend the reviewed WASM host to honor module headers and full import keys."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
path = root / 'src/Lean/Shell.lean'
source = path.read_text()
changes = {
    'IO.Ref (Array (Array Name × Environment))': 'IO.Ref (Array ((Array Import × Bool) × Environment))',
    'def getOrCreateWasmEnvFor (imports : Array Import) : IO Environment := do\n  let key := imports.map (·.module)':
    'def getOrCreateWasmEnvFor (imports : Array Import) (isModule : Bool) : IO Environment := do\n  let key := (imports, isModule)',
    '(level := .private) (loadExts := true) (leakEnv := true)':
    '(level := if isModule then .exported else .private) (loadExts := true) (leakEnv := true)',
    'getOrCreateWasmEnvFor (Elab.headerToImports header)':
    'getOrCreateWasmEnvFor (Elab.headerToImports header) (Elab.HeaderSyntax.isModule header)',
    'let key := env.header.imports.map (·.module)':
    'let key := (env.header.imports, env.header.isModule)',
    'importing {key}…': 'importing {reprStr key}…',
    'cached env for {key}': 'cached env for {reprStr key}',
}
for old, new in changes.items():
    if source.count(old) != 1:
        raise ValueError('Unexpected host source at ' + old)
    source = source.replace(old, new)
path.write_text(source)
print(path)
