"""Add diagnostic worker inspection to a separately prepared asset directory."""
import hashlib
import json
from pathlib import Path
import argparse

p=argparse.ArgumentParser()
p.add_argument('source',type=Path)
p.add_argument('target',type=Path)
p.add_argument('--release-staged',action='store_true')
args=p.parse_args()
source=args.source.resolve()
target=args.target.resolve()
if source==target:raise ValueError('Preserve the passing parity worker')
target.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
provenance=json.loads((source/'runtime-provenance.json').read_text())
worker=(source/'viability-worker.js').read_bytes()
if sha(worker)!=provenance['workerSha256']:raise ValueError('Passing worker identity drift')
for path in source.iterdir():
    if path.name in {'viability-worker.js','runtime-provenance.json'}:continue
    out=target/path.name
    if not out.exists():out.hardlink_to(path)
    elif sha(out.read_bytes())!=sha(path.read_bytes()):raise ValueError('Existing profile artifact differs')
probe=Path(__file__).with_name('memory-probe-worker.js').read_bytes()
if args.release_staged:
    probe+=b'\n'+Path(__file__).with_name('release-staged-worker.js').read_bytes()
worker+=b'\n'+probe
worker_path=target/'viability-worker.js'
if worker_path.exists() and worker_path.read_bytes()!=worker:
    raise ValueError('Existing measured worker is immutable; choose a fresh output directory')
if not worker_path.exists():worker_path.write_bytes(worker)
provenance['baselineWorkerSha256']=provenance['workerSha256']
provenance['workerSha256']=sha(worker)
provenance['memoryProbeSha256']=sha(probe)
provenance['purpose']='Separate diagnostic worker; identical verified runtime and module packs'
provenance['stagedReleaseEnabled']=args.release_staged
manifest_path=target/'runtime-provenance.json'
if manifest_path.exists() and json.loads(manifest_path.read_text())!=provenance:
    raise ValueError('Existing memory profile provenance differs; choose a fresh directory')
if not manifest_path.exists():manifest_path.write_text(json.dumps(provenance,indent=2)+'\n')
print(target)
