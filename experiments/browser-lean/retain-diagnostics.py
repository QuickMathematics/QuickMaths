"""Retain failed/limited experiments without promoting them to corpus parity."""
import hashlib
import json
from pathlib import Path

root=Path(__file__).resolve().parents[2]
base=root/'.bridge-runtime/curated-formal'
out=Path(__file__).with_name('results')/'parity'
rows=[]
for name in ['chromium-native-eh-parity-128.json','chromium-native-eh-stack-128.json',
             'chromium-pool2-release-diagnostic-128.json','chromium-pool2-ivt-diagnostic-128.json',
             'chromium-pool0-release-parity-128.progress.json']:
    path=base/name
    data=json.loads(path.read_text())
    runs=data.get('runs',[data])
    rows.append({'file':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'scope':'Diagnostic only; pool0 was interrupted after repeated IVT timeouts',
        'runs':[{k:r.get(k) for k in ['selectedGroup','profile','done','error','corpusRounds','diagnosticFixture',
            'matrix','phaseMemory','memoryMeasurement','userAgent']}
            | {'proofs':[{k:v for k,v in p.items() if k!='output'} for p in r.get('proofs',[])]} for r in runs]})
(out/'runtime-diagnostics.json').write_text(json.dumps(rows,indent=2)+'\n')
path=base/'rules/QmAbs.log'
source=Path(__file__).with_name('rules')/'QmAbs.lean'
expected=['propext','Classical.choice','Quot.sound']
log=path.read_text()
for name in ['abs_pos','abs_neg']:
    if f"'QuickMaths.Formal.Experimental.{name}' depends on axioms: [{', '.join(expected)}]" not in log:
        raise ValueError('Narrow helper axiom control failed')
(out/'narrow-rule-native.json').write_text(json.dumps({
    'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'log':log,
    'nativeToolchain':'leanprover/lean4:v4.34.0-rc2',
    'mathlibRevision':'42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c',
    'artifacts':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
                 for p in sorted((base/'rules').glob('QmAbs.*')) if p.suffix!='.log'},
    'productionGeneratorChanged':False,'browserLibraryReplacementTested':False,
},indent=2)+'\n')
print(out)
