"""Exercise evidence tampering against a real completed corpus result."""
import argparse
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile

p=argparse.ArgumentParser()
p.add_argument('assets',type=Path)
p.add_argument('result',type=Path)
args=p.parse_args()
root=Path(__file__).resolve().parents[2]
original=json.loads(args.result.read_text())
def first_proof(data):
    return next(p for p in data['runs'][0]['proofs'] if p['name'].endswith('.json'))
mutations={
    'source substitution':lambda d:first_proof(d).update(sourceHash='0'*64),
    'compiler failure disguised as success':lambda d:first_proof(d).update(compilerExitCode=1),
    'forbidden axiom disguised as success':lambda d:first_proof(d).update(axioms=['sorryAx']),
    'missing warm reuse':lambda d:d['runs'][0]['proofs'].pop(),
    'browser certificate promotion':lambda d:first_proof(d).update(certificate={'status':'verified'}),
    'timing diagnostics disguised as parity':lambda d:d['runs'][0].update(timingMode='slow'),
    'widened standard deadline':lambda d:(d['runs'][0].update(timingMode='standard'),first_proof(d).update(budgetMs=120000,originalBudgetMs=10000)),
}
with tempfile.TemporaryDirectory(dir=root/'.bridge-runtime/curated-formal',prefix='gate-') as folder:
    path=Path(folder)/'result.json'
    for name,mutate in mutations.items():
        data=copy.deepcopy(original);mutate(data)
        path.write_text(json.dumps(data))
        run=subprocess.run([sys.executable,str(Path(__file__).with_name('check-browser-parity.py')),
                            str(args.assets),str(path)],capture_output=True,text=True)
        if run.returncode==0:raise AssertionError('Accepted '+name)
        if 'AssertionError' not in run.stderr:raise AssertionError('Unrelated gate failure: '+run.stderr)
        print('PASS rejects',name)
