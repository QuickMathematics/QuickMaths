"""Package the strict, production-base WASM/i386 build for isolated browser tests.

Run in the F:-backed WSL build environment. No production certificate is issued.
The full profile requires every module from the recorded corpus closure.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys

parser=argparse.ArgumentParser()
parser.add_argument('build',type=Path)
parser.add_argument('--scope',choices=['init','full'],default='full')
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
base=root/'.bridge-runtime/lean-browser-next'
out=base/('assets-matched-'+args.scope);out.mkdir(parents=True,exist_ok=True)
corpus=json.loads((root/'experiments/browser-lean/results/production-corpus-closure.json').read_text())
modules=set(corpus['union_modules'])
if args.scope=='init':
    modules=set();todo=['Init']
    while todo:
        m=todo.pop()
        if m in modules:continue
        modules.add(m);todo.extend(corpus['shared_graph'][m])
sha=lambda b:hashlib.sha256(b).hexdigest()
native=args.build/'build-native32'
if (native/'bin/lean').read_bytes()[:5]!=b'\x7fELF\x01':raise ValueError('Expected matched native ELF32 compiler')
version=subprocess.run([str(native/'bin/lean'),'--version'],capture_output=True,text=True,check=True).stdout.strip()
if '6a10ac8c22beadecabdbb0919c2b50214762f91d' not in version:raise ValueError('Compiler base mismatch')
search=[native/'lib/lean',args.build/'mathlib/.lake/build/lib/lean']
search.extend(p/'.lake/build/lib/lean' for p in (args.build/'mathlib/.lake/packages').iterdir() if p.is_dir())
files={}
for m in sorted(modules):
    for suffix in ['.olean','.olean.server','.olean.private','.ir','.ir.sig']:
        name=m.replace('.','/')+suffix
        candidates=[folder/name for folder in search if (folder/name).is_file()]
        if not candidates:
            if suffix=='.olean':raise ValueError('Missing compiled module: '+m)
            continue
        if len(candidates)!=1:raise ValueError('Ambiguous artifact: '+name)
        files[name]=candidates[0]
runtime={}
for name in ['lean.js','lean.wasm']:
    data=(args.build/'build-matched32/stage1/bin'/name).read_bytes()
    if len(data)<1000:raise ValueError('Incomplete linked runtime')
    compressed=gzip.compress(data,compresslevel=9,mtime=0)
    (out/name).write_bytes(data);(out/(name+'.gz')).write_bytes(compressed)
    runtime[name]={'file':name+'.gz','sha256':sha(compressed),'rawSha256':sha(data),'bytes':len(data),'compressedBytes':len(compressed)}
packs=[];payload=bytearray();entries=[];suffix_bytes={}
def flush():
    if not entries:return
    compressed=gzip.compress(payload,compresslevel=9,mtime=0);name=f'matched-{len(packs):03d}.pack'
    (out/name).write_bytes(compressed)
    packs.append({'file':name,'bytes':len(payload),'compressedBytes':len(compressed),'sha256':sha(compressed),'entries':list(entries)})
    entries.clear();payload.clear()
for name,path in sorted(files.items()):
    data=path.read_bytes()
    if payload and len(payload)+len(data)>8*1024*1024:flush()
    entries.append({'path':name,'offset':len(payload),'bytes':len(data),'sha256':sha(data)});payload.extend(data)
    suffix=name[name.index('.',name.rfind('/')+1):]
    suffix_bytes[suffix]=suffix_bytes.get(suffix,0)+len(data)
flush()
config=json.loads((base/'assets/viability.json').read_text())
for fixture in config['fixtures']:
    fixture['group']=corpus['per_fixture'][fixture['name']]['group_id']
patch=root/'experiments/browser-lean/lean-6a10-wasm.patch'
config.update({'variant':'matched','scope':args.scope,'groups':corpus['groups'],'importBudgetMs':600000,'runtime':runtime,'modules':sorted(modules),'packs':packs,
    'environment':{'leanCommit':'6a10ac8c22beadecabdbb0919c2b50214762f91d','mathlibCommit':corpus['pin_ids']['mathlib'],
                   'portSha256':sha(patch.read_bytes()),'importPolicy':'production-private-strict'},
    'nativeVersion':version,'suffixBytes':suffix_bytes})
config.pop('identity',None);config['identity']=sha(json.dumps(config,sort_keys=True).encode())
(out/'viability.json').write_text(json.dumps(config,indent=2)+'\n')
subprocess.run([sys.executable,str(Path(__file__).with_name('prepare-worker.py')),str(out)],check=True)
print(json.dumps({'scope':args.scope,'moduleCount':len(modules),'fileCount':len(files),'packCount':len(packs),
    'suffixBytes':suffix_bytes,'compressedLibraryBytes':sum(p['compressedBytes'] for p in packs),
    'compressedRuntimeBytes':sum(p['compressedBytes'] for p in runtime.values()),'identity':config['identity']},indent=2))
