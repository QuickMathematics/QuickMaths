"""Preserve actual matched-browser evidence, including initialization failures."""
import argparse
import importlib.util
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('inputs', nargs='+', type=Path)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('summary', Path(__file__).parent / 'results/minimal-reference/summarize-results.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
corpus = json.loads((Path(__file__).parent / 'results/production-corpus-closure.json').read_text())
expected = set(corpus['per_fixture'])
successful, attempted = set(), set()
benchmarks = []
for path in args.inputs:
    data = module.summarize(path)
    for run in data['runs']:
        if run.get('variant') != 'matched':
            raise ValueError('Expected a matched runtime benchmark: ' + str(path))
        if run.get('assessment_eligible') is not False or run.get('certificate') is not None:
            raise ValueError('Experimental trust boundary changed')
        for proof in run.get('proofs', []):
            if proof['name'] in expected:
                attempted.add(proof['name'])
                if proof.get('experimentalKernelSuccess') and not proof.get('substitutions'):
                    successful.add(proof['name'])
        stages = {s['stage']: s['atMs'] for s in run.get('stages', []) if 'stage' in s}
        run['derived'].update({
            'runtimeInitializedMs': stages.get('runtime-initialized'),
            'closureStagedMs': stages.get('closure-staged'),
            'readyToVerifyMs': stages.get('ready-to-verify'),
            'failureAtMs': stages.get('failed'),
        })
    benchmarks.append(data)
payload = {
    'generator': 'summarize-matched.py',
    'corpus': {'total': len(expected), 'fixturesWithRecordedOutcomes': sorted(attempted),
               'successfulFixturesAtLeastOnce': sorted(successful),
               'notVerified': sorted(expected - successful)},
    'interpretation': 'Success-at-least-once is diagnostic coverage, not a cross-browser pass or a certificate. Early harness runs do not include an outcome record for the interrupted command; an empty outcome list does not prove no command was attempted. Initialization failure leaves warm verification latency unavailable.',
    'benchmarks': benchmarks,
    'assessment_eligible': False, 'certificate': None,
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'fixturesWithRecordedOutcomes': len(attempted), 'fixturesSuccessfulAtLeastOnce': len(successful), 'total': len(expected)}))
