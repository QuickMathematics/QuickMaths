"""Stage commit-checked reference sources for the source-level closure audit.

The core tar is produced with git archive from the pinned Lean commit (README).
Mathlib/dependency tarballs come from GitHub codeload, never moving branches.
"""
import hashlib
import json
import re
from pathlib import Path
import tarfile
import urllib.request

base=Path(__file__).resolve().parents[2]/'.bridge-runtime/lean-browser-next'
base.mkdir(parents=True,exist_ok=True)
records={}
def stage(archive,destination,commit,url=None,core=False):
    if not archive.exists():
        if not url:raise ValueError('Create the pinned core git archive first; see README')
        with urllib.request.urlopen(url) as src,archive.open('wb') as out:
            while data:=src.read(1024*1024):out.write(data)
    with tarfile.open(archive) as tar:
        if tar.pax_headers.get('comment')!=commit:raise ValueError('Source archive revision mismatch')
        for entry in tar:
            if not entry.isfile():continue
            name=entry.name.split('/',1)[-1]
            if core:
                if not name.startswith(('Init/','Lean/','Std/')) and name not in ['Init.lean','Lean.lean','Std.lean']:continue
            if not (name.endswith('.lean') or name in ['lake-manifest.json','lakefile.toml']):continue
            path=(destination/name).resolve();path.relative_to(destination.resolve())
            path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(tar.extractfile(entry).read())
    records[archive.name]={'commit':commit,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}

stage(base/'reference-core.tar',base/'reference-core','62b6a2291302d4bbeace37642a066b7510d0145c',core=True)
mathlib='de3a9cf33016bbb6d15880d7680643f7ca2d25ba'
stage(base/'reference-mathlib.tar.gz',base/'reference-mathlib',mathlib,
      'https://codeload.github.com/leanprover-community/mathlib4/tar.gz/'+mathlib)
manifest=json.loads((base/'reference-mathlib/lake-manifest.json').read_text())
for p in manifest['packages']:
    if not re.fullmatch(r'[A-Za-z0-9_-]+',p['name']) or not re.fullmatch(r'[a-f0-9]{40}',p['rev']):
        raise ValueError('Unexpected dependency identity')
    if not p['url'].startswith('https://github.com/'):raise ValueError('Unexpected dependency origin')
    repository=p['url'].removeprefix('https://github.com/').removesuffix('.git')
    if '..' in repository or repository.count('/')!=1:raise ValueError('Unexpected dependency URL')
    stage(base/(p['name']+'.tar.gz'),base/'reference-deps'/p['name'],p['rev'],
          'https://codeload.github.com/'+repository+'/tar.gz/'+p['rev'])
(base/'reference-source-provenance.json').write_text(json.dumps(records,indent=2)+'\n')
print('Staged pinned source archives:',len(records))
