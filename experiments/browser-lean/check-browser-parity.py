"""Fail closed unless the complete unchanged corpus also survives warm reuse."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import sys

if not __debug__:
    raise RuntimeError('Run the parity gate without Python optimization; validation assertions are required')
p=argparse.ArgumentParser()
p.add_argument('assets',type=Path)
p.add_argument('result',type=Path)
p.add_argument('--min-rounds',type=int,default=3)
p.add_argument('--output',type=Path)
args=p.parse_args()
config=json.loads((args.assets/'viability.json').read_text())
result=json.loads(args.result.read_text())
assert all(r.get('timingMode','standard')=='standard' for r in result['runs']), 'Timing diagnostics are not standard-budget parity evidence'
assert config['identity']==hashlib.sha256(json.dumps({k:v for k,v in config.items() if k!='identity'},sort_keys=True).encode()).hexdigest(), 'Configuration identity mismatch'
assert result.get('hostSourceHashes') and result.get('hostSourcesChanged') is False, 'Host code changed or was not recorded'
assert result['hostSourceHashes']==result['finalHostSourceHashes']
fixtures={f['name']:f for f in config['fixtures']}
assert len(fixtures)==122 and len(config['negatives'])==71
# Re-execute the production boundary: copied report rows alone are not
# evidence that a negative request was rejected. These requests intentionally
# never produce Lean source and are not counted as browser kernel executions.
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'formal-verifier/src'))
from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.verifier import verify_request
acceptance=runpy.run_path(str(root/'formal-verifier/scripts/kernel_acceptance.py'))
assert set(fixtures)==set(acceptance['POSITIVE'])
for name,fixture in fixtures.items():
    request=normalize_request(acceptance['load_fixture'](name))
    assert fixture['request']==request and fixture['source']==render_request(request), 'Native source drift: '+name
assert {n['name'] for n in config['negatives']}==set(acceptance['NEGATIVE'])
for negative in config['negatives']:
    name=negative['name']
    request=acceptance['load_fixture'](name)
    verdict=verify_request(request,project_dir=root/'formal-verifier')
    assert negative['request']==request
    assert verdict.status==negative['expected']==negative['actual']==acceptance['NEGATIVE'][name]
    assert verdict.certificate is None and not verdict.lean_source, 'Negative crossed preflight: '+name
assert {r['selectedGroup'] for r in result['runs']}==set(config['profiles']), 'Missing curated environment'
positive_executions=0
for run in result['runs']:
    assert run.get('done') and not run.get('error') and not run.get('diagnosticFixture'), 'Incomplete/diagnostic run'
    assert run['profile']==config['identity'] and run['environment']==config['environment']
    assert run['assessment_eligible'] is False and run['certificate'] is None
    assert run['format']=='modules' and run['corpusRounds']>=args.min_rounds
    assert sum(s['stage']=='runtime-initialized' for s in run['stages'])==1, 'Worker was replaced during warm reuse'
    selected={n for n,f in fixtures.items() if f['group']==run['selectedGroup']}
    for negative in config['negatives']:
        rows=[r for r in run['matrix'] if r['name']==negative['name']]
        assert len(rows)==1 and rows[0]['status']==negative['expected']
    for name in selected:
        rows=[r for r in run['matrix'] if r['name']==name]
        proofs=[r for r in run['proofs'] if r['name']==name]
        assert len(rows)==len(proofs)==run['corpusRounds']
        assert {r['round'] for r in rows}==set(range(run['corpusRounds']))
        assert {r['corpusRound'] for r in proofs}==set(range(run['corpusRounds']))
        assert all(r['status']=='kernel_success' for r in rows), name
        expected_hash=hashlib.sha256(fixtures[name]['source'].encode()).hexdigest()
        assert all(r['sourceHash']==expected_hash for r in proofs), 'Source substitution: '+name
        if 'timingMode' in run:
            original_budget=fixtures[name]['request']['policy']['max_seconds']*1000
            assert all(r['budgetMs']==r['originalBudgetMs']==original_budget for r in proofs), 'Standard proof budget changed: '+name
        positive_executions+=len(proofs)
    controls={name:[r for r in run['proofs'] if r['name']==name] for name in ['invalid-control','sorry-control']}
    assert all(controls.values())
    assert all(not r['experimentalKernelSuccess'] for rows in controls.values() for r in rows)
    assert all(r['compilerExitCode']==1 for r in controls['invalid-control'])
    assert all('sorryAx' in r['axioms'] for r in controls['sorry-control'])
    warm=[r for r in run['proofs'] if r['name'].startswith('warm-repeat-')]
    assert len(warm)==5 and all(r['experimentalKernelSuccess'] for r in warm), 'Warm reuse failed'
    assert run['warmFixture'] in selected
    warm_hash=hashlib.sha256(fixtures[run['warmFixture']]['source'].encode()).hexdigest()
    assert all(r['sourceHash']==warm_hash for r in warm), 'Warm source substitution'
    if 'timingMode' in run:
        original_budget=fixtures[run['warmFixture']]['request']['policy']['max_seconds']*1000
        assert all(r['budgetMs']==r['originalBudgetMs']==original_budget for r in warm), 'Standard warm budget changed'
    for proof in run['proofs']:
        assert not proof.get('hostException') and not proof.get('fatalRuntimeError') and not proof.get('error')
        assert proof['assessment_eligible'] is False and proof['certificate'] is None
        if proof['name'] not in controls:
            assert proof['compilerExitCode']==0 and proof['experimentalKernelSuccess'] and proof['errors']==[]
            assert set(proof['axioms'])<= {'propext','Classical.choice','Quot.sound'}
summary={'positiveCases':122,'positiveKernelExecutions':positive_executions,'negativeCasesRejected':71,
         'negativeStage':'freshly re-executed production preflight; no generated Lean source or browser kernel invocation',
         'environments':len(config['profiles']),'minimumSameWorkerRounds':args.min_rounds,
         'identity':config['identity'],'runtime':config['runtime'],'environment':config['environment'],
         'hostSourceHashes':result['hostSourceHashes'],'resultSha256':hashlib.sha256(args.result.read_bytes()).hexdigest(),
         'assessment_eligible':False,'certificate':None}
if args.output:args.output.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
