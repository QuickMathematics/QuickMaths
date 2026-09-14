"""Fault-inject one deadline expiry; verify restart cannot retain raw packs."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]
base=root/'.bridge-runtime/phone-timeout-storage';base.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(base)
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',str(Path(os.environ['LOCALAPPDATA'])/'ms-playwright'))
class Files(http.server.SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');super().end_headers()
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Files,directory=str(root/'docs')))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 context=p.chromium.launch_persistent_context(str(base/'profile'),headless=True)
 context.add_init_script("""const realTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>{
  if(ms===10000&&window.report?.activeProof?.name==='guarded_cancellation.json'&&!window.injected){window.injected=true;return realTimeout(fn,1,...args);}
  return realTimeout(fn,ms,...args);
 };""")
 page=context.new_page()
 page.goto(f'http://127.0.0.1:{server.server_port}/experiments/browser-lean/runner.html?group=qm-formal-v1-ed8d51650a0bb7da&fixture=guarded_cancellation.json&rounds=2&memoryProfile=1&releaseStaged=all')
 page.wait_for_function('typeof startProbe==="function"')
 page.evaluate('void startProbe()')
 page.wait_for_function('window.report.done',timeout=240000)
 report=page.evaluate('window.report')
 assert not report.get('error'),report.get('error')
 proofs=[r for r in report['proofs'] if r['name']=='guarded_cancellation.json']
 assert len(proofs)==2 and 'timed out' in proofs[0]['error'] and proofs[1]['experimentalKernelSuccess']
 assert len([s for s in report['stages'] if s['stage']=='staging-closed' and s['temporaryFilesRemoved']])==2
 assert not report.get('stagingCleanupError')
 assert (awaited:=page.evaluate("async()=>{const root=await navigator.storage.getDirectory();const area=await root.getDirectoryHandle('qm-lean-experimental-staging');return [...await Array.fromAsync(area.keys())];}"))==[],awaited
 page.evaluate('window.stopProbe()')
 report['faultInjection']='one 10-second proof timer deliberately expires after 1 ms; regression only, not parity or timing evidence'
 (base/'result.json').write_text(json.dumps(report,indent=2)+'\n')
 print('PASS forced deadline, worker rebuild, subsequent proof and warm reuse; zero staging directories retained')
 context.close()
server.shutdown()
