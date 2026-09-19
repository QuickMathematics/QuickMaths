"""Package the trusted native verifier for self-hosted browser execution."""
import hashlib,json,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/formal-runtime';OUT.mkdir(exist_ok=True)
archive=OUT/'native-verifier.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for path in sorted((ROOT/'formal-verifier/src/quickmaths_formal').glob('*.py')):
  info=zipfile.ZipInfo('quickmaths_formal/'+path.name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(info,path.read_bytes())
source=ROOT/'docs/experiments/browser-lean/assets'
c=json.loads((source/'viability.json').read_text())
c={k:c[k] for k in ('profiles','packs','runtime','environment','importBudgetMs')}
(OUT/'catalog.json').write_bytes((json.dumps(c,separators=(',',':'))+'\n').encode())
paths={'catalog.json':OUT/'catalog.json','native-verifier.zip':archive,'worker':source/'viability-worker.js'}
for path in OUT.glob('*.whl'): paths[path.name]=path
vendor=ROOT/'docs/vendor/pyodide-0.28.3'
for path in vendor.iterdir():
 if path.suffix in ('.js','.wasm','.zip','.whl') or path.name=='pyodide-lock.json': paths['python/'+path.name]=path
pins={k:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for k,p in paths.items()}
(OUT/'pins.js').write_text('export default '+json.dumps(pins,indent=2)+';\n',encoding='utf-8')
print('Packaged',archive.stat().st_size,'bytes of native verifier source')
