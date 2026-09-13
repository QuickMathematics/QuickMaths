"""Retain production import levels and missing-artifact failures in the WASM port.

The reference's stripped-library fallbacks are deliberately not part of the
matched build. Complete server/private artifacts must be packaged and measured.
"""
from pathlib import Path
import subprocess
import sys

root=Path(sys.argv[1]).resolve()
def restore_between(relative,start,end,original_start=None):
    original=subprocess.run(['git','show','HEAD:'+relative],cwd=root,
                            capture_output=True,text=True,check=True).stdout
    path=root/relative;text=path.read_text()
    original_start=original_start or start
    if original.count(original_start)!=1 or original.count(end)!=1 or text.count(start)!=1 or text.count(end)!=1:
        raise ValueError('Import boundary changed: '+relative)
    a,b=text.index(start),text.index(end)
    restored=text[:a]+original[original.index(original_start):original.index(end)]+text[b:]
    if restored!=text:path.write_text(restored)

restore_between('src/Lean/Environment.lean',
    'private def ImportedModule.getData?',
    '/-- The module data that should be used for server purposes. -/')
restore_between('src/Lean/Environment.lean',
    'private def readModuleDataPartsOfMod',
    'private def readIRPartsOfMod')
restore_between('src/Lean/Elab/Import.lean',
    '  -- Determine import level based on context' if
      '  -- Determine import level based on context' in (root/'src/Lean/Elab/Import.lean').read_text()
      else '  let level := if isModule then',
    '  let (env, messages) ← try', '  let level := if isModule then')

path=root/'src/Lean/Shell.lean';text=path.read_text()
before='(level := .exported) (loadExts := true) (leakEnv := true)'
after='(level := .private) (loadExts := true) (leakEnv := true)'
if before in text:
    if text.count(before)!=1:raise ValueError('Unexpected cached import configuration')
    text=text.replace(before,after)
    text=text.replace('`level := .exported` matches the only data the WASM build ships (base',
                      '`level := .private` matches non-module generated production requests (complete')
    path.write_text(text)
elif after not in text:raise ValueError('Missing cached import configuration')
print('Preserved strict upstream import loading and production request import level')
