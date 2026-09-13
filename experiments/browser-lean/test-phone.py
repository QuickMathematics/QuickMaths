"""Exercise the deployed layout over plain HTTP with its real isolation shim."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import sys
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[2]
base=root/'.bridge-runtime/phone-deployment'
base.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(base)
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',str(Path(os.environ['LOCALAPPDATA'])/'ms-playwright'))
handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(root/'docs'))
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 context=p.chromium.launch_persistent_context(str(base/'profile'),headless=True,viewport={'width':412,'height':915})
 page=context.new_page()
 page.goto(sys.argv[1] if len(sys.argv)>1 else f'http://127.0.0.1:{server.server_port}/experiments/browser-lean/')
 page.locator('#start').wait_for()
 page.wait_for_function('!document.querySelector("#start").disabled',timeout=30000)
 assert page.evaluate('crossOriginIsolated')
 page.select_option('#group','qm-formal-v1-ed8d51650a0bb7da')
 page.click('#start')
 page.wait_for_function('!document.querySelector("#start").disabled',timeout=600000)
 result=page.evaluate('JSON.parse(localStorage.getItem("qm-browser-lean-phone-results-v1"))')
 (base/'result.json').write_text(json.dumps(result,indent=2))
 assert not result.get('error'),result.get('error')
 assert result['summary']=={'positiveExecutions':9,'passed':9,'environmentErrors':0},result.get('summary')
 run=result['runs'][0]
 assert run['assessment_eligible'] is False and run['certificate'] is None
 assert len([x for x in run['proofs'] if x['name'].startswith('warm-repeat-') and x['experimentalKernelSuccess']])==5
 assert not page.locator('iframe').count()
 page.click('#export')
 page.screenshot(path=str(base/'phone-layout.png'),full_page=True)
 print(json.dumps(result['summary']))
 context.close()
server.shutdown()
