"""Stage the exact parity candidate beneath an isolated, temporary Pages route."""
from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[2]
source = root / '.bridge-runtime/curated-formal/assets-native-eh-tail-pool2-release'
target = root / 'docs/experiments/browser-lean'
target.mkdir(parents=True, exist_ok=True)
shutil.copytree(source, target / 'assets', dirs_exist_ok=True)
for name in ['curated.js', 'compatibility.js', 'coi-sw.js', 'UPSTREAM-LICENSE']:
    shutil.copyfile(Path(__file__).parent / name, target / name)
app = target.parent / 'app'
app.mkdir(exist_ok=True)
shutil.copyfile(root / 'docs/formal-environment-loader.js', app / 'formal-environment-loader.js')
files = ['curated.js', 'compatibility.js', 'assets/viability.json', 'assets/viability-worker.js', '../app/formal-environment-loader.js']
pins = {name: hashlib.sha256((target / name).read_bytes()).hexdigest() for name in files}
(target / 'deployment-pins.json').write_text(json.dumps(pins, indent=2) + '\n')
print(f'Staged {sum(p.stat().st_size for p in target.rglob("*") if p.is_file()):,} bytes')
