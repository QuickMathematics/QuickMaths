"""Create a separate worker-only lifetime variant; retain immutable baseline."""
import hashlib,json,argparse
from pathlib import Path
root=Path(__file__).resolve().parents[2]
base=root/'.bridge-runtime/curated-formal'
source=base/'assets-native-eh-tail-pool2-release'
p=argparse.ArgumentParser()
p.add_argument('--own-staging',action='store_true')
args=p.parse_args()
target=base/('assets-a17-consume-own-v1' if args.own_staging else 'assets-a17-consume-v1')
target.mkdir(exist_ok=True)
sha=lambda data:hashlib.sha256(data).hexdigest()
provenance=json.loads((source/'runtime-provenance.json').read_text())
worker=(source/'viability-worker.js').read_bytes()
assert sha(worker)==provenance['workerSha256']
if args.own_staging:
 old=b'FS.writeFile(fullPath, new Uint8Array(file.data));'
 assert worker.count(old)==1
 worker=worker.replace(old,b'FS.writeFile(fullPath, new Uint8Array(file.data), {canOwn:true});')
hook=Path(__file__).with_name('consume-module-worker.js').read_bytes()
worker=worker+b'\n'+hook
for path in source.iterdir():
 if path.name in {'viability-worker.js','runtime-provenance.json'}:continue
 out=target/path.name
 if not out.exists():out.hardlink_to(path)
 else:assert sha(out.read_bytes())==sha(path.read_bytes())
provenance.update(baselineWorkerSha256=provenance['workerSha256'],workerSha256=sha(worker),consumeHookSha256=sha(hook),purpose='A17 import peak: release fully consumed module staging during import')
if args.own_staging:provenance['ownedTransferredStaging']=True
for name,data in [('viability-worker.js',worker),('runtime-provenance.json',(json.dumps(provenance,indent=2)+'\n').encode())]:
 out=target/name
 if out.exists():assert out.read_bytes()==data,'Immutable variant differs; use a new version'
 else:out.write_bytes(data)
print(target)
