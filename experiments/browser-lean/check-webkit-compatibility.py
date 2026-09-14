"""Lightweight Windows WebKit probe; not an iPhone simulator or capacity test."""
import os,json,threading,http.server,functools
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2];base=root/'.bridge-runtime/webkit-compatibility'
base.mkdir(parents=True,exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(base)
assets=root/'docs/experiments/browser-lean/assets';config=json.loads((assets/'viability.json').read_text());spec=config['runtime']['lean.wasm']
class Handler(http.server.SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');super().end_headers()
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(assets)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 c=p.webkit.launch_persistent_context(str(base/'binary-profile'),headless=True);page=c.new_page()
 page.goto('https://quickmathematics.github.io/QuickMaths/experiments/browser-lean/?candidate=webkit-compatibility',wait_until='networkidle',timeout=30000)
 page.wait_for_timeout(2000)
 probe=page.evaluate("""()=>({ua:navigator.userAgent,isolated:crossOriginIsolated,secure:isSecureContext,sab:typeof SharedArrayBuffer,wasmException:typeof WebAssembly.Exception,decompression:typeof DecompressionStream,opfs:typeof navigator.storage?.getDirectory,locks:typeof navigator.locks?.request,serviceWorker:typeof navigator.serviceWorker,status:document.querySelector('#status')?.textContent})""")
 (base/'probe.json').write_text(json.dumps(probe,indent=2));print(json.dumps(probe,indent=2))
 page.goto(f'http://127.0.0.1:{server.server_port}/')
 report=page.evaluate("""async(spec)=>{
 const r={ua:navigator.userAgent,isolated:crossOriginIsolated,rawSha256:spec.rawSha256,certificate:null,assessment_eligible:false};
 const start=performance.now();
 try {
 const response=await fetch(spec.file);const compressed=await response.arrayBuffer();
 const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(await sha(compressed)!==spec.sha256)throw Error('Compressed hash mismatch');
 const raw=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 if(await sha(raw)!==spec.rawSha256)throw Error('Raw hash mismatch');r.bytes=raw.byteLength;r.hashVerified=true;r.loadMs=performance.now()-start;
 const t=performance.now();await WebAssembly.compile(raw);r.compiled=true;r.compileMs=performance.now()-t;
 }catch(e){r.error=String(e);r.compiled=false;}return r;
 }""",spec)
 (base/'binary.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));c.close()
server.shutdown()
