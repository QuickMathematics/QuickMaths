"""Build the current corpus imports with matched native i386 Lean; no 64-bit cache."""
import json
import os
from pathlib import Path
import subprocess
import sys

root=Path(sys.argv[1]).resolve()
corpus=json.loads(Path(sys.argv[2]).read_text())
toolchain=root/'build-native32'
lean=toolchain/'bin/lean';lake=toolchain/'bin/lake'
if lean.read_bytes()[:5]!=b'\x7fELF\x01':raise ValueError('Expected an ELF32 compiler')
version=subprocess.run([str(lean),'--version'],capture_output=True,text=True,check=True).stdout
if '4.34.0' not in version or '6a10ac8c22beadecabdbb0919c2b50214762f91d' not in version:
    raise ValueError('Compiler base revision mismatch: '+version)
mathlib=root/'mathlib'
revision=subprocess.run(['git','rev-parse','HEAD'],cwd=mathlib,capture_output=True,text=True,check=True).stdout.strip()
if revision!=corpus['pin_ids']['mathlib']:raise ValueError('Mathlib revision mismatch')
env=os.environ.copy()
env['PATH']=str(toolchain/'bin')+os.pathsep+env.get('PATH','')
env['LEAN_SYSROOT']=str(toolchain)
env['LEAN_NUM_THREADS']='4'
env.pop('LEAN_PATH',None)
print(version.strip(),flush=True)
subprocess.run([str(lake),'--no-cache','env','lean','--version'],cwd=mathlib,env=env,check=True)
subprocess.run([str(lake),'--no-cache','build',*['+'+m+':olean' for m in corpus['union_roots']]],
               cwd=mathlib,env=env,check=True)
