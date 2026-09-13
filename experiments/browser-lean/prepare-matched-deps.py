"""Fetch only revisions recorded by the production-pinned Mathlib manifest."""
import json
from pathlib import Path
import re
import subprocess
import sys

root=Path(sys.argv[1]).resolve()
pin='42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c'
def git(path,*args):
    return subprocess.run(['git','-C',str(path),*args],check=True,capture_output=True,text=True).stdout.strip()
if git(root,'rev-parse','HEAD')!=pin:raise ValueError('Mathlib revision mismatch')
manifest=json.loads((root/'lake-manifest.json').read_text())
packages=root/'.lake/packages';packages.mkdir(parents=True,exist_ok=True)
for p in manifest['packages']:
    if not re.fullmatch(r'[A-Za-z0-9_-]+',p['name']) or not re.fullmatch(r'[a-f0-9]{40}',p['rev']):
        raise ValueError('Unexpected dependency identity')
    if not re.fullmatch(r'https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',p['url']):
        raise ValueError('Unexpected dependency origin')
    target=packages/p['name'];target.mkdir(exist_ok=True)
    if not (target/'.git').exists():
        git(target,'init')
        git(target,'remote','add','origin',p['url'])
        git(target,'fetch','--depth=1','origin',p['rev'])
        git(target,'checkout','--detach',p['rev'])
    if git(target,'rev-parse','HEAD')!=p['rev']:raise ValueError('Dependency revision mismatch: '+p['name'])
    print(p['name'],p['rev'],flush=True)
