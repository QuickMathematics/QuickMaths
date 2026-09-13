"""Use Lean's normal explicit artifact map; do not soften missing-part checks."""
from pathlib import Path
import sys
path=Path(sys.argv[1])/'src/Lean/Shell.lean'
source=path.read_text()
old='  let env ← importModules imports {} 0\n    (level := if isModule then .exported else .private) (loadExts := true) (leakEnv := true)'
new='''  -- Curated packs name every public/IR artifact explicitly, as Lake does.
  -- The strict importer still rejects any required but unprovided part.
  let setup ← ModuleSetup.load "/lib/lean/qm-setup.json"
  let env ← importModules imports {} 0 (arts := setup.importArts)
    (level := if isModule then .exported else .private) (loadExts := true) (leakEnv := true)'''
if source.count(old)!=1:raise ValueError('Unexpected import hook')
path.write_text(source.replace(old,new))
