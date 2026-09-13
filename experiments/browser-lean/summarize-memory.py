"""Summarize labelled phase measurements; never infer live WASM allocations."""
import argparse
import hashlib
import json
from pathlib import Path
import statistics

p=argparse.ArgumentParser()
p.add_argument('result',type=Path)
p.add_argument('--output',type=Path,required=True)
args=p.parse_args()
data=json.loads(args.result.read_text())
if data.get('hostSourcesChanged') is not False:raise ValueError('Unstable or unrecorded host sources')
rows=[]
for run in data['runs']:
    if not run.get('done') or run.get('error'):raise ValueError('Incomplete profile run')
    phases=[]
    for phase in run['phaseMemory']:
        if not phase['sampleCount']:raise ValueError('Unsampled phase')
        phases.append({**phase,'incrementalPrivateResidentBytes':phase['privateMemory']['uss']-data['baselineMemory']['uss']})
    ready=next(s for s in run['stages'] if s['stage']=='ready-to-verify')
    holds=sum(s.get('holdingMs',0) for s in run['stages'] if s['atMs']<ready['atMs'])
    proofs=[p for p in run['proofs'] if p['name'].endswith('.json')]
    if not all(p['experimentalKernelSuccess'] and p['compilerExitCode']==0 for p in proofs):raise ValueError('Profile corpus failed')
    rows.append({'environment':run['selectedGroup'],'identity':run['profile'],'runKind':run['runKind'],
        'rounds':run['corpusRounds'],'positiveExecutions':len(proofs),
        'releaseStaged':run.get('releaseStaged','none'),
        'phases':phases,'readyMsIncludingProfilingHolds':ready['atMs'],
        'readyMsExcludingIntentionalHolds':ready['atMs']-holds,
        'warmFixture':run['warmFixture'],'warmMs':[p['elapsed'] for p in run['proofs'] if p['name'].startswith('warm-repeat-')],
        'corpusMedianMs':statistics.median(p['elapsed'] for p in proofs),
        'corpusMaxMs':max(p['elapsed'] for p in proofs),
        'memoryMeasurement':run['memoryMeasurement'],'afterWorkerDiscard':run['afterWorkerDiscard'],
        'cache':run['cache'],'originStorage':run.get('originStorage'),
        'userAgent':run['userAgent'],'assessment_eligible':False,'certificate':None})
out={k:data[k] for k in ['baseline','baselineMemory','host','executedAt','hostSourceHashes','profileLogicalFileBytes']}
out.update({'sourceFile':args.result.name,'rawEvidenceSha256':hashlib.sha256(args.result.read_bytes()).hexdigest(),
    'method':'Private resident USS summed over owned Chromium descendants, normal QuickMaths map baseline. Phase idle holds are labelled. Linear-memory capacity is not live allocator usage. MEMFS bytes are exact logical/capacity counts. Residual memory is not attributed to a specific allocator.',
    'runs':rows})
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(out,indent=2)+'\n')
print(args.output)
