"""Render the entire existing corpus and inventory each curated source header."""
import importlib.util
import json
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.bridge-runtime/curated-formal'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'formal-verifier/src'))
from quickmaths_formal.contract import normalize_request, canonical_hash
from quickmaths_formal.environments import request_environment
from quickmaths_formal.lean import render_request
from quickmaths_formal.verifier import verify_request

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('corpus-closure.py'))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)
acceptance = runpy.run_path(str(ROOT / 'formal-verifier/scripts/kernel_acceptance.py'))
sources, _ = inventory.inventory()
fixtures, negatives, profiles, graph = [], [], {}, {}
for name in acceptance['POSITIVE']:
    request = normalize_request(acceptance['load_fixture'](name))
    environment = request_environment(request)
    key = environment['id']
    if key not in profiles:
        modules, edges, missing = inventory.closure(environment['imports'], sources)
        if missing:
            raise ValueError('Unresolved modules: ' + repr(missing))
        profiles[key] = {**environment, 'modules': modules, 'fixtures': []}
        graph.update(edges)
    profiles[key]['fixtures'].append(name)
    fixtures.append({'name': name, 'request': request, 'source': render_request(request),
                     'group': key, 'capabilities': environment['capabilities']})
for name, expected in acceptance['NEGATIVE'].items():
    request = acceptance['load_fixture'](name)
    result = verify_request(request, project_dir=ROOT / 'formal-verifier')
    if result.status != expected or result.certificate is not None or result.lean_source:
        raise ValueError(f'Negative preflight drift: {name}: {result.status}')
    negatives.append({'name': name, 'request': request, 'expected': expected,
                      'actual': result.status, 'message': result.message,
                      'stage': 'unchanged-production-preflight', 'certificate': None})
matrix = {}
for key, profile in profiles.items():
    rows = [{'name': f['name'], 'expected': 'kernel_success' if f['group'] == key else 'different_environment_required',
             'canonicalEnvironment': f['group']} for f in fixtures]
    rows += [{'name': n['name'], 'expected': n['expected'], 'stage': n['stage']} for n in negatives]
    matrix[key] = rows
payload = {'schemaVersion': 1, 'profiles': profiles, 'fixtures': fixtures, 'negatives': negatives,
           'matrix': matrix, 'graph': graph, 'pins': inventory.PIN_IDS,
           'assessment_eligible': False, 'certificate': None}
payload['identity'] = canonical_hash(payload)
(OUT / 'corpus.json').write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: {'capabilities': v['capabilities'], 'fixtures': len(v['fixtures']), 'roots': len(v['imports']), 'modules': len(v['modules'])} for k,v in profiles.items()}, indent=2))
print('Negative preflight:', len(negatives), 'Matrix rows per environment:', len(fixtures) + len(negatives))
