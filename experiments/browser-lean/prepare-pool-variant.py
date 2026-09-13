"""Isolate a smaller Emscripten prestarted pool; keep Lean's two task workers."""
import gzip
import hashlib
import json
from pathlib import Path
import argparse

p=argparse.ArgumentParser()
p.add_argument('source',type=Path)
p.add_argument('target',type=Path)
p.add_argument('--size',type=int,choices=[0,1,2],default=2)
args=p.parse_args()
source=args.source.resolve()
target=args.target.resolve()
if source==target:raise ValueError('Preserve the baseline assets')
sha=lambda b:hashlib.sha256(b).hexdigest()
config=json.loads((source/'viability.json').read_text())
provenance=json.loads((source/'runtime-provenance.json').read_text())
spec=config['runtime']['lean.js']
compressed=(source/spec['file']).read_bytes()
if sha(compressed)!=spec['sha256']:raise ValueError('Input runtime integrity failure')
data=gzip.decompress(compressed)
if sha(data)!=spec['rawSha256']:raise ValueError('Unpacked runtime integrity failure')
old=b'var pthreadPoolSize=4;'
new=f'var pthreadPoolSize={args.size};'.encode()
if data.count(old)!=1:raise ValueError('Pinned Emscripten pool hook drift')
data=data.replace(old,new)
compressed=gzip.compress(data,compresslevel=9,mtime=0)
filename='lean.js-'+sha(compressed)+'.gz'
target.mkdir(parents=True,exist_ok=True)
for path in source.iterdir():
    if path.name in {'viability.json','runtime-provenance.json',spec['file']}:continue
    out=target/path.name
    if not out.exists():out.hardlink_to(path)
    elif sha(out.read_bytes())!=sha(path.read_bytes()):raise ValueError('Existing variant artifact differs')
(target/filename).write_bytes(compressed)
config['runtime']['lean.js']={'file':filename,'bytes':len(data),'compressedBytes':len(compressed),
    'rawSha256':sha(data),'sha256':sha(compressed)}
config['runtimeVariant']=f'native-eh-tail-pool{args.size}'
config['baselineIdentity']=config.pop('identity')
purpose=('Two prestarted pthreads for the unchanged two-worker Lean task manager' if args.size==2
         else f'{args.size} prestarted pthreads; unchanged two-worker Lean task manager, synchronous corpus frontend')
config['postLinkTransforms']=[{'old':old.decode(),'new':new.decode(),
    'purpose':purpose}]
config['identity']=sha(json.dumps(config,sort_keys=True).encode())
config_path=target/'viability.json'
if config_path.exists() and json.loads(config_path.read_text())!=config:
    raise ValueError('Existing catalog is immutable; choose a fresh output directory')
if not config_path.exists():config_path.write_text(json.dumps(config,indent=2)+'\n')
provenance['baselineIdentity']=provenance['identity']
provenance['baselineJsSha256']=spec['rawSha256']
provenance['identity']=config['identity']
provenance['variant']=config['runtimeVariant']
provenance['runtime']=config['runtime']
provenance['postLinkTransforms']=config['postLinkTransforms']
provenance['transformScriptSha256']=sha(Path(__file__).read_bytes())
provenance_path=target/'runtime-provenance.json'
if provenance_path.exists():
    recorded=json.loads(provenance_path.read_text())
    # Reusing exactly the same artifact does not rewrite its original build record.
    for key in ['identity','runtime','postLinkTransforms','workerSha256','sourcePatchSha256']:
        if recorded[key]!=provenance[key]:raise ValueError('Existing runtime provenance differs')
else:provenance_path.write_text(json.dumps(provenance,indent=2)+'\n')
print(target)
