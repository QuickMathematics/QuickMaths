"""Prepare the reduced reference profile without changing production proof pins."""
import gzip
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import subprocess

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--variant', choices=['full','slim'], default='full')
args=parser.parse_args()
OLD=ROOT/'.bridge-runtime/lean-browser'
OUT=ROOT/'.bridge-runtime/lean-browser-next/assets'
sys.path.insert(0,str(ROOT/'formal-verifier/src'))
from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
spec=importlib.util.spec_from_file_location('acceptance',ROOT/'formal-verifier/scripts/kernel_acceptance.py')
acceptance=importlib.util.module_from_spec(spec);spec.loader.exec_module(acceptance)
layer=json.loads((OUT/'minimal-layer.json').read_text())
release=json.loads(Path(__file__).with_name('provenance.json').read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
runtime={}
for name in ['lean.js','lean.wasm']:
    asset_name=('slim/' if args.variant=='slim' else '')+name
    data=(OLD/'assets'/asset_name).read_bytes()
    if sha(data)!=release['objects'][asset_name]['sha256']:raise ValueError('Runtime hash mismatch')
    compressed=gzip.compress(data,compresslevel=9,mtime=0)
    (OUT/(name+'.gz')).write_bytes(compressed)
    (OUT/name).write_bytes(data)
    runtime[name]={'file':name+'.gz','sha256':sha(compressed),'rawSha256':sha(data),'bytes':len(data),'compressedBytes':len(compressed)}
fixtures=[]
for name in acceptance.POSITIVE:
    request=normalize_request(json.loads((ROOT/'formal-verifier/fixtures'/name).read_text()))
    source=render_request(request)
    fixtures.append({'name':name,'request':request,'source':source,'sourceHash':sha(source.encode())})
config={'variant':args.variant,'environment':{'leanCommit':layer['leanCommit'],'mathlibCommit':layer['mathlibCommit']},
        'productionEnvironment':{'lean_toolchain':'leanprover/lean4:v4.34.0-rc2','mathlib_revision':'42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c'},
        'runtime':runtime,'modules':layer['modules'],'packs':layer['packs'],'fixtures':fixtures}
config['identity']=sha(json.dumps(config,sort_keys=True).encode())
(OUT/'viability.json').write_text(json.dumps(config,indent=2)+'\n')
subprocess.run([sys.executable,str(Path(__file__).with_name('prepare-worker.py')),str(OUT)],check=True)
print('Prepared',len(fixtures),'existing positive fixtures;',len(layer['modules']),'reference modules')
