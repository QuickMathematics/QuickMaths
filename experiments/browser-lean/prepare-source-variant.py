"""Refresh exact native corpus sources without rebuilding immutable module packs."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'formal-verifier/src'))
from quickmaths_formal.lean import render_request
from quickmaths_formal.environments import request_environment

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('source', type=Path)
p.add_argument('target', type=Path)
args = p.parse_args()
source, target = args.source.resolve(), args.target.resolve()
if target.exists():
    raise ValueError('Choose a fresh target; existing catalogs are immutable')
config = json.loads((source / 'viability.json').read_text(encoding='utf-8'))
provenance = json.loads((source / 'runtime-provenance.json').read_text(encoding='utf-8'))
baseline = config['identity']
changed = []
for fixture in config['fixtures']:
    if request_environment(fixture['request'])['id'] != fixture['group']:
        raise ValueError('Environment changed: rebuild the closure instead')
    rendered = render_request(fixture['request'])
    if rendered != fixture['source']:
        changed.append(fixture['name'])
        fixture['source'] = rendered
config['identity'] = hashlib.sha256(json.dumps(
    {k: v for k, v in config.items() if k != 'identity'}, sort_keys=True).encode()).hexdigest()
provenance.update(identity=config['identity'], sourceOnlyBaselineIdentity=baseline,
                  sourceOnlyChangedFixtures=changed)
target.mkdir(parents=True)
for path in source.iterdir():
    if path.name not in {'viability.json', 'runtime-provenance.json'}:
        (target / path.name).hardlink_to(path)
for name, payload in [('viability.json', config), ('runtime-provenance.json', provenance)]:
    (target / name).write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'identity': config['identity'], 'changed': changed}, indent=2))
