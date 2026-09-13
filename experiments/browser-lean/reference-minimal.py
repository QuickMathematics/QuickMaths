"""Repack the exact import closure for the reference-compatible algebra roots.

This does not claim the older reference can verify the complete production corpus.
Pinned source packages and verified prior reference assets must already exist.
"""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import tarfile

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'.bridge-runtime/lean-browser-next'
OLD=ROOT/'.bridge-runtime/lean-browser'
OUT=BASE/'assets'
OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('corpus',Path(__file__).with_name('corpus-closure.py'))
corpus=importlib.util.module_from_spec(spec);spec.loader.exec_module(corpus)
core=BASE/'reference-core'
with tarfile.open(BASE/'reference-core.tar') as archive:
    for item in archive:
        if not item.isfile() or not item.name.endswith('.lean'):continue
        path=(core/item.name.removeprefix('src/')).resolve();path.relative_to(core.resolve())
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(archive.extractfile(item).read())
sources={}
for folder in [core,BASE/'reference-mathlib',*sorted((BASE/'reference-deps').iterdir())]:
    for path in folder.rglob('*.lean'):
        sources['.'.join(path.relative_to(folder).with_suffix('').parts)]=path
roots=['Mathlib.Data.Real.Basic','Mathlib.Topology.Defs.Filter','Mathlib.Tactic.FieldSimp',
       'Mathlib.Tactic.Ring','Mathlib.Tactic.Linarith','Mathlib.Tactic.NormNum','Mathlib.Tactic.Positivity.Basic']
todo=[*roots,'Init'];seen=set();graph={}
while todo:
    module=todo.pop()
    if module in seen:continue
    seen.add(module)
    if module not in sources:raise ValueError('Missing source: '+module)
    imports=corpus.header_imports(sources[module].read_text(encoding='utf-8-sig'))
    graph[module]=imports;todo.extend(imports)
required={m.replace('.','/')+suffix for m in seen for suffix in ['.olean','.ir','.ir.sig']}
files={}
library_pin=json.loads(Path(__file__).with_name('reference-library-provenance.json').read_text())
def original_asset(name):
    data=(OLD/'assets'/name).read_bytes();p=library_pin['objects'][name]
    if len(data)!=p['bytes'] or hashlib.sha256(data).hexdigest()!=p['sha256']:
        raise ValueError('Reference library integrity failure: '+name)
    return data
manifest=json.loads(original_asset('real-analysis-layer.json'))
for pack in manifest['packs']:
    chosen=[e for e in pack['entries'] if e['path'] in required]
    if not chosen:continue
    data=gzip.decompress(original_asset('real-analysis-lib/'+pack['file']))
    if len(data)!=pack['bytes']:raise ValueError('Pack size mismatch')
    for entry in chosen:files[entry['path']]=data[entry['offset']:entry['offset']+entry['bytes']]
missing=sorted({m.replace('.','/')+'.olean' for m in seen}-files.keys())
if missing:raise ValueError('Missing required compiled modules: '+repr(missing))
sha=lambda b:hashlib.sha256(b).hexdigest()
packs=[];payload=bytearray();entries=[]
def flush():
    if not entries:return
    raw=bytes(payload);compressed=gzip.compress(raw,compresslevel=9,mtime=0)
    name=f'minimal-{len(packs):03d}.pack';(OUT/name).write_bytes(compressed)
    packs.append({'file':name,'bytes':len(raw),'compressedBytes':len(compressed),'sha256':sha(compressed),'entries':list(entries)})
    entries.clear();payload.clear()
for name in sorted(files):
    data=files[name]
    if payload and len(payload)+len(data)>8*1024*1024:flush()
    entries.append({'path':name,'offset':len(payload),'bytes':len(data),'sha256':sha(data)})
    payload.extend(data)
flush()
result={'scope':'Reference-compatible algebra import closure, not complete production curriculum',
        'leanCommit':manifest['leanCommit'],'mathlibCommit':manifest['mathlibCommit'],
        'roots':roots,'modules':sorted(seen),'graph':graph,'packs':packs,
        'rawBytes':sum(len(v) for v in files.values()),'compressedBytes':sum(p['compressedBytes'] for p in packs)}
(OUT/'minimal-layer.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['modules','graph','packs']}))
print('Modules',len(seen),'packs',len(packs),'files',len(files))
