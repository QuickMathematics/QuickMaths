"""Stage the exact parity candidate beneath an isolated, temporary Pages route."""
from pathlib import Path
import hashlib
import json
import shutil
import argparse

root = Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser()
p.add_argument('--assets',default='assets-native-eh-tail-pool2-release')
p.add_argument('--staging',choices=['memfs','opfs'],default='memfs')
args=p.parse_args()
source = (root / '.bridge-runtime/curated-formal' / args.assets).resolve()
source.relative_to((root / '.bridge-runtime/curated-formal').resolve())
target = root / 'docs/experiments/browser-lean'
target.mkdir(parents=True, exist_ok=True)
shutil.copytree(source, target / 'assets', dirs_exist_ok=True)
for name in ['curated.js', 'compatibility.js', 'coi-sw.js', 'UPSTREAM-LICENSE','timing-policy.js']:
    original='curated-opfs.js' if name=='curated.js' and args.staging=='opfs' else name
    shutil.copyfile(Path(__file__).parent / original, target / name)
app = target.parent / 'app'
app.mkdir(exist_ok=True)
shutil.copyfile(root / 'docs/formal-environment-loader.js', app / 'formal-environment-loader.js')
files = ['curated.js', 'compatibility.js', 'timing-policy.js', 'assets/viability.json', 'assets/viability-worker.js', '../app/formal-environment-loader.js']
pins = {name: hashlib.sha256((target / name).read_bytes()).hexdigest() for name in files}
(target / 'deployment-pins.json').write_text(json.dumps(pins, indent=2) + '\n')
print(f'Staged {sum(p.stat().st_size for p in target.rglob("*") if p.is_file()):,} bytes')
