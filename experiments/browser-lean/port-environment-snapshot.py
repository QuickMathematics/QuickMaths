"""Snapshot the synchronous imported environment, without CLI task trees."""
from pathlib import Path
import sys
path=Path(sys.argv[1])/'src/Lean/Shell.lean'
source=path.read_text()
marker='/-- Whether Lean was built with an address sanitizer enabled. -/'
addition='''-- Versioned curated environment format: no command/task snapshot tree and no proof body.
@[export lean_wasm_save_environment]
def wasmSaveEnvironment (code : String) (path : String) : IO UInt32 := do
  let inputCtx := Parser.mkInputContext code "QuickMathsHeader.lean"
  let (header, _, messages) ← Parser.parseHeader inputCtx
  if messages.hasErrors || !Elab.HeaderSyntax.isModule header then
    throw <| IO.userError "Expected a valid public module header"
  let env ← getOrCreateWasmEnvFor (Elab.headerToImports header) true
  IO.eprintln "[WASM ENV] imported; compacting environment"
  let payload := (env, getRegularInitAttrModIdxs env)
  let compactor ← unsafe CompactedRegion.save ⟨path⟩ `_qm_environment_v1 payload
    #[] none (allowClosures := true)
  Runtime.forget compactor
  IO.FS.writeFile ⟨path ++ ".deps"⟩ "[]"
  IO.eprintln "[WASM ENV] saved"
  return 0

@[export lean_wasm_load_environment]
def wasmLoadEnvironment (path : String) : IO UInt32 := do
  let (payload, region) ← unsafe CompactedRegion.read (α := Environment × Array Nat) ⟨path⟩ #[]
  -- Cache lifetime owns these imported regions until the worker is discarded.
  Runtime.forget region
  let (env, initModIdxs) := payload
  unsafe enableInitializersExecution
  withImporting do
    unsafe runInitAttrsForModules env initModIdxs {}
  unsafe enableInitializersExecution
  wasmEnvCache.modify (·.push ((env.header.imports, env.header.isModule), env))
  return 0

'''
if source.count(marker)!=1 or 'def wasmSaveEnvironment' in source:raise ValueError('Unexpected snapshot hook')
path.write_text(source.replace(marker,addition+marker))
