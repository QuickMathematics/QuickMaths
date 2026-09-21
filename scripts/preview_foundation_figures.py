"""Render the foundation lesson figures locally for a bounded visual audit."""
import os,json,base64
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('QM_BROWSER_TEST_DIR','F:/QuickMathsTests/foundations'))
OUT.mkdir(parents=True,exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(OUT)
media_root=ROOT/'content/math/algebra_foundations/skills/media'
ids=json.loads((ROOT/'docs/test-support/foundations-roadmap.json').read_text())['lesson_ids']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport={'width':1100,'height':1400})
 figures=[]
 for folder in sorted(media_root.glob('native-*foundations')):
  for file in sorted(folder.glob('*.svg')):
   figures.append((file.stem, str(file.relative_to(media_root)), base64.b64encode(file.read_bytes()).decode('ascii')))
 for file in sorted((media_root/'native-arithmetic-onramp').glob('*.svg')):
  figures.append((file.stem, str(file.relative_to(media_root)), base64.b64encode(file.read_bytes()).decode('ascii')))
 from html import escape
 for start in range(0,len(figures),6):
  cards=''.join('<article><h3>'+escape(id)+'</h3><img src="data:image/svg+xml;base64,'+b64+'"><p>'+escape(alt)+'</p></article>' for id,alt,b64 in figures[start:start+6])
  page.set_content('<style>body{font:16px sans-serif;background:#eee;margin:20px}main{display:grid;grid-template-columns:1fr 1fr;gap:15px}article{background:white;padding:12px}img{width:100%;height:290px;object-fit:contain}p{font-size:13px}</style><main>'+cards+'</main>')
  page.locator('img').evaluate_all('(imgs)=>Promise.all(imgs.map(i=>i.decode()))')
  page.screenshot(path=str(OUT/f'figures-{start//6+1}.png'),full_page=True)
 print(json.dumps({'figures':len(figures),'contact_sheets':(len(figures)+5)//6,'directory':str(OUT)}))
 browser.close()
