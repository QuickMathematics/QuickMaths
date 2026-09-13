"""Build shared public-module packs and exact-WASM header snapshots (F-backed WSL)."""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
import runpy
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.bridge-runtime/curated-formal'
parser = argparse.ArgumentParser()
parser.add_argument('build', type=Path)
parser.add_argument('--snapshots', action='store_true')
parser.add_argument('--profile', action='append')
args = parser.parse_args()
build = args.build.resolve()
for folder, expected in [('lean-upstream', '6a10ac8c22beadecabdbb0919c2b50214762f91d'),
                         ('mathlib', '42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c')]:
    actual = subprocess.run(['git', '-C', str(build / folder), 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
    if actual != expected:
        raise ValueError('Pinned source mismatch: ' + folder)
if (build / 'build-native32/bin/lean').read_bytes()[:5] != b'\x7fELF\x01':
    raise ValueError('Expected the matched i386 artifact producer')
out = BASE / 'assets'
out.mkdir(parents=True, exist_ok=True)
corpus = json.loads((BASE / 'corpus.json').read_text())
profiles = corpus['profiles']
sha = lambda data: hashlib.sha256(data).hexdigest()
previous = json.loads((out / 'viability.json').read_text()) if (out / 'viability.json').exists() else {}
objects = [*previous.get('runtime', {}).values(), *previous.get('packs', []), *previous.get('snapshots', {}).values()]
reusable = {obj['rawSha256']: obj for obj in objects}

def compressed_object(data, prefix):
    raw_hash = sha(data)
    old = reusable.get(raw_hash)
    if old and old['file'].startswith(prefix + '-') and (out / old['file']).is_file():
        packed = (out / old['file']).read_bytes()
        if len(packed) == old['compressedBytes'] and sha(packed) == old['sha256']:
            return {key: old[key] for key in ['file', 'bytes', 'compressedBytes', 'sha256', 'rawSha256']}
    compressed = gzip.compress(data, compresslevel=9, mtime=0)
    name = prefix + '-' + sha(compressed) + '.gz'
    (out / name).write_bytes(compressed)
    return {'file': name, 'bytes': len(data), 'compressedBytes': len(compressed),
            'sha256': sha(compressed), 'rawSha256': raw_hash}

runtime = {}
runtime_dir = build / 'curated-runtime'
runtime_dir.mkdir(exist_ok=True)
optimized_js = runpy.run_path(str(Path(__file__).with_name('optimize-dlsym.py')))['optimize'](
    (build / 'build-matched32/stage1/bin/lean.js').read_text())
(runtime_dir / 'lean.js').write_text(optimized_js)
wasm_link = runtime_dir / 'lean.wasm'
if wasm_link.is_symlink():wasm_link.unlink()
if wasm_link.exists() and wasm_link.stat().st_ino != (build / 'build-matched32/stage1/bin/lean.wasm').stat().st_ino:
    wasm_link.unlink()
if not wasm_link.exists():wasm_link.hardlink_to(build / 'build-matched32/stage1/bin/lean.wasm')
for name in ['lean.js', 'lean.wasm']:
    runtime[name] = compressed_object((runtime_dir / name).read_bytes(), name)
patch = subprocess.run(['git', '-C', str(build / 'lean-upstream'), 'diff', '--binary', '--full-index', 'HEAD', '--', '.', ':(exclude)src/emscripten-exports.txt'], capture_output=True, check=True).stdout
patch_path = Path(__file__).with_name('lean-6a10-curated-full.patch')
if patch != patch_path.read_bytes():
    raise ValueError('Build source does not match the reviewed curated patch')
search = [build / 'build-native32/lib/lean', build / 'mathlib/.lake/build/lib/lean']
search += [p / '.lake/build/lib/lean' for p in (build / 'mathlib/.lake/packages').iterdir() if p.is_dir()]
memberships = defaultdict(list)
for key, profile in profiles.items():
    for module in profile['modules']:
        memberships[module].append(key)
files, buckets = {}, defaultdict(list)
for module, members in sorted(memberships.items()):
    # Module-public roots never request import-all. Strict Lean reports an error
    # if a required part is absent; there is no fallback to weaker import data.
    for suffix in ['.olean', '.ir', '.ir.sig']:
        name = module.replace('.', '/') + suffix
        candidates = [p / name for p in search if (p / name).is_file()]
        if len(candidates) != 1:
            raise ValueError('Missing/ambiguous compiled artifact: ' + name)
        files[name] = candidates[0]
        buckets[tuple(sorted(members))].append(name)
packs = []
for members, names in sorted(buckets.items()):
    payload, entries = bytearray(), []
    def flush():
        if not entries:
            return
        packs.append({**compressed_object(bytes(payload), 'modules'), 'profiles': list(members), 'entries': list(entries)})
        payload.clear(); entries.clear()
    for name in names:
        data = files[name].read_bytes()
        if payload and len(payload) + len(data) > 8 * 1024 * 1024:
            flush()
        entries.append({'path': name, 'offset': len(payload), 'bytes': len(data)})
        payload.extend(data)
    flush()

snapshots = {}
reference_driver = ROOT / '.bridge-runtime/lean-browser/reference/scripts/lean-wasm-node.cjs'
driver_bytes = reference_driver.read_bytes()
if sha(driver_bytes.replace(b'\r\n', b'\n')) != '54851bfe112a00f5ae0355afb58cf6d8c92b2e92cc2ce5168cd8e37af6a4ba24':
    raise ValueError('Reference Node driver drifted')
driver = build / 'curated-node.cjs'
marker = b"vm.runInThisContext(fs.readFileSync(leanJs, 'utf8'), { filename: leanJs });"
hook = Path(__file__).with_name('environment-driver-hook.cjs').read_bytes()
if driver_bytes.count(marker) != 1:
    raise ValueError('Snapshot driver insertion point drifted')
driver_bytes = driver_bytes.replace(marker, hook + b'\n' + marker)
# The original driver defaults to its executable's memory settings; this keeps
# the same 4 GiB maximum as the browser instead of its optional 2 GiB override.
driver.write_bytes(driver_bytes)
node = build / 'node-v24.21.0-linux-x64/bin/node'
if not node.is_file():
    raise ValueError('Expected the installed, pinned emsdk Node runtime')
for key, profile in profiles.items():
    artifact = build / 'curated' / key
    work = artifact / 'work'
    work.mkdir(parents=True, exist_ok=True)
    (artifact / 'bin').mkdir(exist_ok=True)
    for name in runtime:
        link = artifact / 'bin' / name
        if link.is_symlink():link.unlink()
        if link.exists() and link.stat().st_ino != (runtime_dir / name).stat().st_ino:link.unlink()
        if not link.exists():
            link.hardlink_to(runtime_dir / name)
    for module in profile['modules']:
        for suffix in ['.olean', '.ir', '.ir.sig']:
            name = module.replace('.', '/') + suffix
            link = artifact / 'lib/lean' / name
            link.parent.mkdir(parents=True, exist_ok=True)
            # NODEFS follows symlinks inside its virtual filesystem, where an
            # absolute build-tree target does not exist. Same-volume hardlinks
            # preserve exact bytes without copying the closure five times.
            if link.is_symlink() or (link.exists() and link.stat().st_ino != files[name].stat().st_ino):
                link.unlink()
            if not link.exists():
                link.hardlink_to(files[name])
    header = 'module\n' + '\n'.join('public import ' + m for m in profile['imports']) + '\n\n#check True\n'
    (work / 'header.lean').write_text(header)
    setup = {'name': 'QuickMathsHeader', 'isModule': True, 'dynlibs': [], 'plugins': [], 'options': {}, 'importArts': {
        module: [['/lib/lean/' + module.replace('.', '/') + '.olean'],
                 ['/lib/lean/' + module.replace('.', '/') + suffix for suffix in ['.ir.sig', '.ir']]]
        for module in profile['modules']}}
    setup_data = (json.dumps(setup, sort_keys=True) + '\n').encode()
    (artifact / 'lib/lean/qm-setup.json').write_bytes(setup_data)
    profile['setup'] = setup
    metadata_path = work / 'snapshot-build.json'
    binding = {'wasm': runtime['lean.wasm']['rawSha256'], 'js': runtime['lean.js']['rawSha256'],
               'header': sha(header.encode()), 'driver': sha(driver_bytes), 'profile': key,
               'setup': sha(setup_data), 'nodeVersion': '24.21.0', 'format': 'qm-environment-v1',
               'artifacts': sha(json.dumps([
                   {'rawSha256': pack['rawSha256'], 'entries': pack['entries']}
                   for pack in packs if key in pack['profiles']
               ], sort_keys=True).encode())}
    saved = json.loads(metadata_path.read_text()) if metadata_path.exists() else None
    if args.snapshots and (not args.profile or key in args.profile) and (not saved or saved['binding'] != binding or saved['exitCode'] != 0):
        started = time.monotonic()
        with (work / 'snapshot.log').open('wb') as log:
            try:
                result = subprocess.run([str(node), '--stack-size=8192', str(driver), str(artifact), str(work),
                                     '/work/header.lean'],
                                    stdout=log, stderr=subprocess.STDOUT, timeout=1200)
                exit_code = result.returncode
            except subprocess.TimeoutExpired:
                exit_code = 124
        saved = {'binding': binding, 'exitCode': exit_code, 'elapsedSeconds': time.monotonic() - started}
        if exit_code != 0:
            saved['diagnostics'] = (work / 'snapshot.log').read_text(errors='replace').splitlines()[-30:]
        if exit_code == 0:
            sidecar = json.loads((work / 'header.snap.deps').read_text())
            if sidecar != [] or not (work / 'header.snap').read_bytes().startswith(b'olean'):
                raise ValueError('Expected a self-contained exact-WASM snapshot')
        metadata_path.write_text(json.dumps(saved, indent=2) + '\n')
        print('snapshot', key, json.dumps(saved), flush=True)
    if saved and saved['binding'] == binding and saved['exitCode'] == 0:
        data = (work / 'header.snap').read_bytes()
        snapshots[key] = {**compressed_object(data, 'snapshot'), 'build': saved}

config = {'variant': 'curated', 'scope': 'curated', 'profiles': profiles, 'groups': profiles,
          'fixtures': corpus['fixtures'], 'negatives': corpus['negatives'], 'matrix': corpus['matrix'],
          'modules': sorted(memberships), 'packs': packs, 'snapshots': snapshots, 'runtime': runtime,
          'importBudgetMs': 600000, 'taskWorkers': 2,
          'environment': {'leanCommit': '6a10ac8c22beadecabdbb0919c2b50214762f91d',
                          'mathlibCommit': '42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c',
                          'portSha256': sha(patch), 'importPolicy': 'production-module-public'}}
config['identity'] = sha(json.dumps(config, sort_keys=True).encode())
(out / 'viability.json').write_text(json.dumps(config, indent=2) + '\n')
subprocess.run(['python3', str(Path(__file__).with_name('prepare-worker.py')), str(out), '--task-workers', '2'], check=True)
summary = {'identity': config['identity'], 'runtime': runtime, 'portSha256': sha(patch), 'profiles': {}}
for key, p in profiles.items():
    selected = [pack for pack in packs if key in pack['profiles']]
    summary['profiles'][key] = {'capabilities': p['capabilities'], 'modules': len(p['modules']),
                              'rawModuleBytes': sum(x['bytes'] for x in selected),
                              'compressedModuleBytes': sum(x['compressedBytes'] for x in selected),
                              'packCount': len(selected), 'snapshot': snapshots.get(key)}
(BASE / 'payload-size.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2), flush=True)
