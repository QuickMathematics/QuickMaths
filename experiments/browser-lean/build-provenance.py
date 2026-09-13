"""Record the actual custom toolchain and linker inputs without issuing certificates."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root=Path(__file__).resolve().parents[2];build=Path(sys.argv[1])
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda:stream.read(1024*1024),b''):h.update(data)
    return {'bytes':path.stat().st_size,'sha256':h.hexdigest()}
def cmd(*args):return subprocess.run(args,capture_output=True,text=True,check=True).stdout.strip()
patch=root/'experiments/browser-lean/lean-6a10-wasm.patch'
data={'leanBase':cmd('git','-C',str(build/'lean-upstream'),'rev-parse','HEAD'),
      'mathlib':cmd('git','-C',str(build/'mathlib'),'rev-parse','HEAD'),
      'port':digest(patch),'emsdkCommit':cmd('git','-C',str(build/'emsdk'),'rev-parse','HEAD'),
      'emscripten':'4.0.22','cmake':cmd(str(build/'cmake-3.31.6-linux-x86_64/bin/cmake'),'--version').splitlines()[0],
      'nativeVersion':cmd(str(build/'build-native32/bin/lean'),'--version'),
      'nativeElfClass':(build/'build-native32/bin/lean').read_bytes()[4],
      'exports':json.loads((build/'exports-matched.json').read_text()),
      'options':{'gmp':False,'mimalloc':False,'mmap':False,'pthreads':True,'pthreadPool':4,'maximumMemoryBytes':4294967296,'declareAsmModuleExports':False},
      'objects':{},'assessment_eligible':False,'certificate':None}
for name in ['build-matched32/stage1/bin/lean.js','build-matched32/stage1/bin/lean.wasm',
             'build-native32/bin/lean','build-native32/lib/lean/libleanshared.so']:
    data['objects'][name]=digest(build/name)
out=root/'experiments/browser-lean/results/matched-build-provenance.json'
out.write_text(json.dumps(data,indent=2)+'\n');print(out)
