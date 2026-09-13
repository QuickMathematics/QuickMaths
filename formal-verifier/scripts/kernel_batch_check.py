"""Kernel-check generated acceptance proofs in batches, without minting receipts.

Amortizes mathlib loading for integration diagnostics. The app/receipt path is
tested separately through kernel_acceptance.py and the real HTTP smoke test.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess

from kernel_acceptance import POSITIVE, load_fixture, ROOT
from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.rules import preflight
from quickmaths_formal.verifier import _environment_error, _lake_command, _safe_environment, _parse_axioms


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch-size', type=int, default=20)
    parser.add_argument('--fixture', action='append')
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 40:
        parser.error('batch-size must be 1 to 40')
    names = args.fixture or POSITIVE
    if set(names) - set(POSITIVE):
        parser.error('Unknown fixture')
    command = _lake_command(ROOT)
    error = _environment_error(ROOT, command) if command else 'Lake is unavailable'
    if error:
        raise SystemExit(error)
    output = ROOT / '.lake' / 'kernel-diagnostics'
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for offset in range(0, len(names), args.batch_size):
        batch = names[offset:offset + args.batch_size]
        imports = set()
        bodies = []
        for name in batch:
            request = normalize_request(load_fixture(name))
            if preflight(request):
                raise RuntimeError(f'{name}: preflight is not ready')
            source = render_request(request)
            namespace = 'Fixture_' + name.removesuffix('.json')
            imports.update(line for line in source.splitlines() if line.startswith('import '))
            body = '\n'.join(line for line in source.splitlines() if not line.startswith('import '))
            bodies.append((name, body.replace('QuickMathsGenerated', namespace), namespace))
        lines = sorted(imports) + ['']
        ranges = []
        for name, body, namespace in bodies:
            start = len(lines) + 1
            lines.extend(body.splitlines())
            lines.append('')
            ranges.append({'fixture': name, 'start': start, 'end': len(lines), 'namespace': namespace})
        artifact = output / f'batch-{offset:03d}.lean'
        artifact.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        artifact.with_suffix('.json').write_text(json.dumps(ranges, indent=2), encoding='utf-8')
        run = subprocess.run([*command, str(artifact)], cwd=ROOT, env=_safe_environment(),
                             capture_output=True, text=True, encoding='utf-8', timeout=240)
        log = run.stdout + '\n' + run.stderr
        artifact.with_suffix('.log').write_text(log, encoding='utf-8')
        audited = True
        for row in ranges:
            try:
                axioms = _parse_axioms(log.replace(row['namespace'] + '.result', 'QuickMathsGenerated.result'))
                audited &= not (set(axioms) - {'propext', 'Classical.choice', 'Quot.sound'})
            except ValueError:
                audited = False
        passed = run.returncode == 0 and audited
        results.append({'fixtures': batch, 'passed': passed, 'log': str(artifact.with_suffix('.log'))})
        print(f"{'PASS' if passed else 'FAIL'} batch {offset}: {len(batch)} proofs; {artifact.with_suffix('.log')}", flush=True)
    (output / 'summary.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    return 0 if all(row['passed'] for row in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
