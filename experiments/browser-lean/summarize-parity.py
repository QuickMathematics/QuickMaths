"""Retain reproducible parity evidence without browser profiles or raw assets."""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import subprocess
import sys

p=argparse.ArgumentParser()
p.add_argument('assets',type=Path)
p.add_argument('result',type=Path)
p.add_argument('--output',type=Path,default=Path(__file__).with_name('results')/'parity')
args=p.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
write=lambda name,data:(args.output/name).write_text(json.dumps(data,indent=2)+'\n')
subprocess.run([sys.executable,str(Path(__file__).with_name('check-browser-parity.py')),
                str(args.assets),str(args.result),'--output',str(args.output/'gate.json')],check=True)
data=json.loads(args.result.read_text())
config=json.loads((args.assets/'viability.json').read_text())
write('runtime-provenance.json',json.loads((args.assets/'runtime-provenance.json').read_text()))
write('corpus-sources.json',{
    'configSha256':sha((args.assets/'viability.json').read_bytes()),
    'generatorFiles':{str(p.relative_to(root)):sha(p.read_bytes()) for p in sorted((root/'formal-verifier/src/quickmaths_formal').glob('*.py'))},
    'positiveSources':{f['name']:sha(f['source'].encode()) for f in config['fixtures']},
    'negativePreflight':config['negatives'],
})
evidence={k:v for k,v in data.items() if k not in {'samples','runs'}}
evidence['rawEvidenceSha256']=sha(args.result.read_bytes())
evidence['sourceFile']=args.result.name
evidence['runs']=[]
measurements=[]
for run in data['runs']:
    kept={k:v for k,v in run.items() if k not in {'diagnostics','proofs'}}
    kept['proofs']=[{k:v for k,v in proof.items() if k!='output'} for proof in run['proofs']]
    evidence['runs'].append(kept)
    phases={}
    for stage in run['stages']:phases.setdefault(stage['stage'],stage['atMs'])
    proofs=[p['elapsed'] for p in run['proofs'] if p['name'].endswith('.json')]
    measurements.append({'id':run['selectedGroup'],'runKind':run['runKind'],
        'capabilities':config['profiles'][run['selectedGroup']]['capabilities'],
        'firstReadyMs':phases['ready-to-verify'],'runtimeInitializedMs':phases['runtime-initialized'],
        'corpusMedianMs':statistics.median(proofs),'corpusMaxMs':max(proofs),
        'warmFixture':run['warmFixture'],
        'warmMs':[p['elapsed'] for p in run['proofs'] if p['name'].startswith('warm-repeat-')],
        'cache':run['cache'],'memory':run['memoryMeasurement'],'afterDiscard':run['afterWorkerDiscard'],
        'linearMemory':run.get('memory'),
        'note':'Parity stress run; separate phase profiling is required for memory attribution.'})
write('browser-evidence.json',evidence)
write('measurements.json',measurements)
print('Retained',args.output)
