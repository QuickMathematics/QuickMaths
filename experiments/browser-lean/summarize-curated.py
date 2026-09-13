"""Retain measured corpus outcomes and sizing without browser-profile data."""
import hashlib
import json
import re
import statistics
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'.bridge-runtime/curated-formal'
OUT=Path(__file__).with_name('results')/'curated'
OUT.mkdir(parents=True,exist_ok=True)
config=json.loads((BASE/'assets/viability.json').read_text())
size=json.loads((BASE/'payload-size.json').read_text())
(OUT/'payload-size.json').write_text(json.dumps(size,indent=2)+'\n')
(OUT/'artifacts.json').write_text(json.dumps({key:config[key] for key in ['identity','runtime','packs','snapshots']},separators=(',',':'))+'\n')
profiles={key:{k:v for k,v in p.items() if k!='setup'} for key,p in config['profiles'].items()}
(OUT/'environments.json').write_text(json.dumps({'environment':config['environment'],'profiles':profiles},separators=(',',':'))+'\n')
native_log=(BASE/'native-corpus-final.log').read_text()
retry_log=(BASE/'native-retry.log').read_text()
native_rows=[]
for status,kind,name in re.findall(r'^\[(PASS|FAIL)\] (\S+) (\S+\.json)$',native_log,re.M):
    retried=status=='FAIL' and f'{name} None' in retry_log.splitlines()
    native_rows.append({'name':name,'stage':'kernel' if kind=='kernel' else 'preflight',
                        'expected': 'verified' if kind=='kernel' else kind,
                        'passed':status=='PASS' or retried,'startupTimeoutRetried':retried})
if len(native_rows)!=193 or not all(row['passed'] for row in native_rows):
    raise ValueError('Native acceptance evidence is incomplete')
(OUT/'native-evidence.json').write_text(json.dumps({'perProofBudgetSeconds':60,
    'leanToolchain':'leanprover/lean4:v4.34.0-rc2','mathlibRevision':config['environment']['mathlibCommit'],
    'logs':{name:hashlib.sha256((BASE/name).read_bytes()).hexdigest() for name in ['native-corpus-final.log','native-retry.log']},
    'rows':native_rows},indent=2)+'\n')
evidence=[]
for path in sorted(BASE.glob('*-curated-validated-*-128.json')):
    data=json.loads(path.read_text())
    if 'runs' not in data:continue
    item={key:value for key,value in data.items() if key not in {'samples','runs'}}
    item['rawEvidenceSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    item['sourceFile']=path.name
    item['runs']=[]
    for run in data['runs']:
        expected_names={f['name'] for f in config['fixtures']} | {n['name'] for n in config['negatives']}
        if not run.get('done') or {r['name'] for r in run.get('matrix',[])} != expected_names or len(run['matrix']) != len(expected_names):
            raise ValueError(f'Incomplete corpus matrix: {path.name}')
        if run.get('profile') != config['identity'] or run.get('assessment_eligible') is not False or run.get('certificate') is not None:
            raise ValueError('Runtime identity or assessment boundary drift')
        sources={f['name']:hashlib.sha256(f['source'].encode()).hexdigest() for f in config['fixtures']}
        for proof in run.get('proofs',[]):
            if proof['name'] in sources and proof.get('sourceHash') != sources[proof['name']]:
                raise ValueError('Generated corpus source was substituted')
            if proof['name'] in {'invalid-control','sorry-control'} and proof.get('experimentalKernelSuccess'):
                raise ValueError('Kernel rejection control accepted an invalid proof')
            if proof.get('assessment_eligible') is not False or proof.get('certificate') is not None:
                raise ValueError('Browser result crossed the certificate boundary')
        record={k:v for k,v in run.items() if k not in {'diagnostics','runtimeOutput'}}
        record['proofs']=[{k:v for k,v in proof.items() if k!='output'} for proof in run.get('proofs',[])]
        record['lastDiagnostics']=run.get('diagnostics',[])[-8:]
        item['runs'].append(record)
    evidence.append(item)
(OUT/'browser-evidence.json').write_text(json.dumps(evidence,separators=(',',':'))+'\n')
failures={}
for item in evidence:
    for run in item['runs']:
        for proof in run.get('proofs',[]):
            if proof['name'].endswith('.json') and not proof.get('experimentalKernelSuccess'):
                failures.setdefault(proof['name'],[]).append({'format':run['format'],'runKind':run['runKind'],
                    'error':proof.get('error'),'fatalRuntimeError':proof.get('fatalRuntimeError',False)})
(OUT/'failures.json').write_text(json.dumps(failures,indent=2,sort_keys=True)+'\n')
rows=[]
for item in evidence:
    for run in item['runs']:
        timings={}
        for event in run.get('stages',[]):
            timings.setdefault(event['stage'],event['atMs'])
        warm=[p['elapsed'] for p in run.get('proofs',[]) if p['name'].startswith('warm-repeat') and p.get('experimentalKernelSuccess')]
        corpus_times=[p['elapsed'] for p in run.get('proofs',[]) if p['name'].endswith('.json') and p.get('experimentalKernelSuccess')]
        matrix=run.get('matrix',[])
        counts={status:sum(row['status']==status for row in matrix) for status in sorted({r['status'] for r in matrix})}
        rows.append({'browser':item['browser'],'environment':run.get('selectedGroup'),'format':run.get('format'),
                     'runKind':run['runKind'],'readyMs':timings.get('ready-to-verify'),'warmMs':warm,
                     'workerInitializations':sum(event['stage']=='runtime-initialized' for event in run.get('stages',[])),
                     'successfulCorpusMedianMs':statistics.median(corpus_times) if corpus_times else None,
                     'successfulCorpusMaxMs':max(corpus_times) if corpus_times else None,
                     'cache':run.get('cache'),'memory':run.get('memoryMeasurement'),'afterDiscard':run.get('afterWorkerDiscard'),
                     'outcomes':counts,'error':run.get('error')})
(OUT/'measurements.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(rows,indent=2))
