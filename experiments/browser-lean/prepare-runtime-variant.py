"""Swap only a measured runtime; reuse the identical curated module packs."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import runpy
import subprocess

if not __debug__:
    raise RuntimeError('Runtime preparation requires validation assertions')
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'.bridge-runtime/curated-formal'
parser=argparse.ArgumentParser()
parser.add_argument('build',type=Path)
parser.add_argument('--name',required=True)
parser.add_argument('--source',default='lean-upstream-eh')
parser.add_argument('--runtime',default='build-matched32-eh')
parser.add_argument('--patch',default='lean-6a10-native-eh.patch')
args=parser.parse_args()
if not re.fullmatch('[a-z0-9-]+',args.name):parser.error('Use a simple variant name')
build=args.build.resolve()
source=(build/args.source).resolve();source.relative_to(build)
runtime_dir=(build/args.runtime).resolve();runtime_dir.relative_to(build)
sha=lambda data:hashlib.sha256(data).hexdigest()
pins={'leanCommit':'6a10ac8c22beadecabdbb0919c2b50214762f91d',
      'mathlibCommit':'42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c'}
for directory,key in [(source,'leanCommit'),(build/'mathlib','mathlibCommit')]:
    assert subprocess.check_output(['git','-C',str(directory),'rev-parse','HEAD']).decode().strip()==pins[key]
if subprocess.check_output(['git','-C',str(build/'mathlib'),'diff','HEAD','--']).strip():
    raise ValueError('Mathlib source has unrecorded changes')
patch=subprocess.check_output(['git','-C',str(source),'diff','--binary','--full-index','HEAD','--','.',':(exclude)src/emscripten-exports.txt'])
expected=Path(__file__).with_name(args.patch).read_bytes()
if patch!=expected:raise ValueError('Runtime source differs from the reviewed full patch')
if b'diff --git a/src/kernel/' in patch:raise ValueError('Unexpected kernel source change')
out=BASE/('assets-'+args.name);out.mkdir(exist_ok=True)
base_config=json.loads((BASE/'assets/viability.json').read_text())
config=json.loads(json.dumps(base_config))
fresh_corpus=json.loads((BASE/'corpus.json').read_text())
if config['fixtures']!=fresh_corpus['fixtures'] or config['negatives']!=fresh_corpus['negatives']:
    raise ValueError('Baseline corpus no longer matches the current native generator/preflight')
for pack in config['packs']:
    source_file=BASE/'assets'/pack['file']
    data=source_file.read_bytes()
    if len(data)!=pack['compressedBytes'] or sha(data)!=pack['sha256']:
        raise ValueError('Baseline module pack integrity failure')
    target=out/pack['file']
    if not target.exists():target.hardlink_to(source_file)
    elif sha(target.read_bytes())!=pack['sha256']:raise ValueError('Variant pack differs')
runtime={}
for name in ['lean.js','lean.wasm']:
    data=(runtime_dir/'bin'/name).read_bytes()
    if name=='lean.js':
        data=runpy.run_path(str(Path(__file__).with_name('optimize-dlsym.py')))['optimize'](data.decode()).encode()
    compressed=gzip.compress(data,compresslevel=9,mtime=0)
    filename=name+'-'+sha(compressed)+'.gz'
    (out/filename).write_bytes(compressed)
    runtime[name]={'file':filename,'bytes':len(data),'compressedBytes':len(compressed),
                   'rawSha256':sha(data),'sha256':sha(compressed)}
config['runtime']=runtime
config['snapshots']={}
config['environment']={**pins,'portSha256':sha(patch),'importPolicy':'production-module-public'}
config['runtimeVariant']=args.name
config['baselineIdentity']=base_config['identity']
config.pop('identity',None)
config['identity']=sha(json.dumps(config,sort_keys=True).encode())
(out/'viability.json').write_text(json.dumps(config,indent=2)+'\n')
subprocess.run(['python3',str(Path(__file__).with_name('prepare-worker.py')),str(out),'--task-workers','2'],check=True)
manifest={'variant':args.name,'identity':config['identity'],'environment':config['environment'],
          'runtime':runtime,'modulePackCount':len(config['packs']),
          'modulePacksUnchanged':config['packs']==base_config['packs'],
          'fixturesUnchanged':config['fixtures']==base_config['fixtures'],
          'assessment_eligible':False,'certificate':None,
          'sourcePatchSha256':sha(patch),
          'emscriptenVersion':(build/'emsdk/upstream/emscripten/emscripten-version.txt').read_text().strip(),
          'runtimeCompileFlags':(runtime_dir/'runtime/CMakeFiles/leanrt.dir/flags.make').read_text(),
          'files':{str(path.relative_to(runtime_dir)):sha(path.read_bytes()) for path in
                   [runtime_dir/'CMakeCache.txt',runtime_dir/'runtime/CMakeFiles/leanrt.dir/flags.make']},
          'exportsSha256':sha((source/'src/emscripten-exports.txt').read_bytes())}
manifest['workerSha256']=sha((out/'viability-worker.js').read_bytes())
if (runtime_dir/'bin/lean.js.symbols').exists():
    manifest['symbolMapSha256']=sha((runtime_dir/'bin/lean.js.symbols').read_bytes())
(out/'runtime-provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
