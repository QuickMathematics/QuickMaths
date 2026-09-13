"""Prepare ignored, hash-pinned browser experiment assets; no production changes."""
import gzip
import hashlib
import json
import pathlib
import sys
import shutil
import tarfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = ROOT / '.bridge-runtime/lean-browser'
ASSETS = BASE / 'assets'
sys.path.insert(0, str(ROOT / 'formal-verifier/src'))
from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request

def digest(data):
    return hashlib.sha256(data).hexdigest()

release = json.loads((pathlib.Path(__file__).parent / 'provenance.json').read_text())
ASSETS.mkdir(parents=True, exist_ok=True)
def file_hash(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()
def archive(key, filename):
    spec = release[key]
    path = BASE / filename
    if not path.exists():
        with urllib.request.urlopen(spec['url']) as src, path.open('wb') as dst:
            shutil.copyfileobj(src, dst, 1024*1024)
    if path.stat().st_size != spec['bytes'] or file_hash(path) != spec['sha256']:
        raise ValueError('Archive integrity failure: ' + str(path))
    return path
if '--download' in sys.argv:
    for key, filename in [('staticAssets','pages-assets.tar.gz'), ('fixture','runtime-fixture.tar.gz')]:
        with tarfile.open(archive(key,filename), 'r|gz') as source:
            for entry in source:
                name = entry.name.removeprefix('./')
                if key == 'fixture':
                    if name not in ['bin/lean.js','bin/lean.wasm']: continue
                    name = name[4:]
                elif not (name in ['core-layer.json','real-analysis-layer.json'] or name.startswith(('core-lib/','real-analysis-lib/'))): continue
                if entry.isdir(): continue
                if not entry.isfile(): raise ValueError('Non-file archive entry: '+name)
                target = (ASSETS/name).resolve(); target.relative_to(ASSETS.resolve())
                target.parent.mkdir(parents=True,exist_ok=True)
                with source.extractfile(entry) as src,target.open('wb') as dst: shutil.copyfileobj(src,dst)
worker_path = BASE / 'upstream-worker.js'
if not worker_path.exists():
    with urllib.request.urlopen('https://raw.githubusercontent.com/cauli/lean4-wasm-in-browser/'+release['referenceCommit']+'/public/lean-worker-persistent.worker.js') as src:
        worker_path.write_bytes(src.read())
if digest(worker_path.read_bytes().replace(b'\r\n',b'\n')) != release['workerSha256']: raise ValueError('Worker integrity failure')
inventory = {}
for name in ['lean.js', 'lean.wasm']:
    data = (ASSETS / name).read_bytes()
    assert digest(data) == release['objects'][name]['sha256']
    compressed = gzip.compress(data, compresslevel=9, mtime=0)
    (ASSETS / (name + '.gz')).write_bytes(compressed)
    inventory[name] = {'bytes': len(data), 'gzipBytes': len(compressed), 'sha256': digest(data)}
for layer in ['core', 'real-analysis']:
    manifest = json.loads((ASSETS / (layer + '-layer.json')).read_text())
    for pack in manifest['packs']:
        name = layer + '-lib/' + pack['file']
        data = (ASSETS / name).read_bytes()
        assert len(data) == pack['compressedBytes']
        inventory[name] = {'bytes': len(data), 'sha256': digest(data)}
    name = layer + '-layer.json'
    data = (ASSETS / name).read_bytes()
    inventory[name] = {'bytes': len(data), 'sha256': digest(data)}
fixtures = []
for name in ['guarded_cancellation', 'difference_quotient', 'conjugate_identity', 'polynomial_derivative']:
    request = normalize_request(json.loads((ROOT / 'formal-verifier/fixtures' / (name + '.json')).read_text()))
    source = render_request(request)
    fixtures.append({'name': name, 'request': request, 'source': source, 'sha256': digest(source.encode())})
(ASSETS / 'experiment.json').write_text(json.dumps({'release': release, 'inventory': inventory, 'fixtures': fixtures}, indent=2))
worker = worker_path.read_text(encoding='utf-8')
worker = worker.replace('wasmMemory: p.memory', 'wasmMemory: (self.probeMemory = p.memory)')
worker += "\nself.addEventListener('message', e => { if(e.data.type === 'memory') self.postMessage({type:'memory', heapBytes: self.probeMemory?.buffer.byteLength || 0}); });\n"
(ASSETS / 'worker.js').write_text(worker, encoding='utf-8')
print(json.dumps({name: inventory[name] for name in ['lean.js','lean.wasm']}, indent=2))
