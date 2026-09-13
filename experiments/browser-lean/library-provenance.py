"""Derive reference library object hashes from the hash-pinned release archive."""
import hashlib
import json
from pathlib import Path
import tarfile

root=Path(__file__).resolve().parents[2]
here=Path(__file__).parent
pin=json.loads((here/'provenance.json').read_text())['staticAssets']
archive=root/'.bridge-runtime/lean-browser/pages-assets.tar.gz'
h=hashlib.sha256()
with archive.open('rb') as stream:
    for data in iter(lambda:stream.read(1024*1024),b''):h.update(data)
if h.hexdigest()!=pin['sha256'] or archive.stat().st_size!=pin['bytes']:
    raise ValueError('Pinned archive integrity failure')
objects={}
with tarfile.open(archive,'r|gz') as tar:
    for entry in tar:
        name=entry.name.removeprefix('./')
        if not entry.isfile() or not (name=='real-analysis-layer.json' or name.startswith('real-analysis-lib/')):continue
        data=tar.extractfile(entry).read()
        objects[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
(here/'reference-library-provenance.json').write_text(json.dumps({'archiveSha256':pin['sha256'],'objects':objects},indent=2)+'\n')
print('Pinned library objects:',len(objects))
