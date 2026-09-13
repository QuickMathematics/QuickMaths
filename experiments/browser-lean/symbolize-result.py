"""Symbolize diagnostic stacks only against a matching prepared WASM binary."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

p=argparse.ArgumentParser()
p.add_argument('result',type=Path)
p.add_argument('assets',type=Path)
p.add_argument('runtime',type=Path)
args=p.parse_args()
config=json.loads((args.assets/'viability.json').read_text())
wasm=args.runtime/'lean.wasm'
assert hashlib.sha256(wasm.read_bytes()).hexdigest()==config['runtime']['lean.wasm']['rawSha256']
symbol_file=args.runtime/'lean.js.symbols'
symbols=dict(line.split(':',1) for line in symbol_file.read_text().splitlines())
result=json.loads(args.result.read_text())
print('wasmSha256',config['runtime']['lean.wasm']['rawSha256'])
print('symbolMapSha256',hashlib.sha256(symbol_file.read_bytes()).hexdigest())
for run in result['runs']:
    assert run['profile']==config['identity']
    for proof in run.get('proofs',[]):
        if not proof.get('stack'):continue
        print('\n'+proof['name']+': '+proof.get('error',''))
        seen=set()
        for index in re.findall(r'wasm-function\[(\d+)\]',proof['stack']):
            if index in seen:continue
            seen.add(index)
            name=symbols.get(index,'<no symbol>')
            name=subprocess.check_output(['c++filt',name]).decode().strip()
            print(index,name)
