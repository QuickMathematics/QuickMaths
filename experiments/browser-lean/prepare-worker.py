"""Instrument the hash-pinned worker for either isolated browser build profile."""
import hashlib
import json
from pathlib import Path
import sys

root=Path(__file__).resolve().parents[2]
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
release=json.loads(Path(__file__).with_name('provenance.json').read_text())
worker=(root/'.bridge-runtime/lean-browser/upstream-worker.js').read_text(encoding='utf-8')
if hashlib.sha256(worker.replace('\r\n','\n').encode()).hexdigest()!=release['workerSha256']:
    raise ValueError('Worker pin mismatch')
worker=worker.replace('const candidates = isIOS ? [1024, 768, 512] : [2048, 1536, 1024, 768];',
    "const requested = Number(new URLSearchParams(location.search).get('initialMB') || 128); const candidates = [Math.max(64, Math.min(2048, requested))];")
worker=worker.replace('wasmMemory: p.memory','wasmMemory: (self.probeMemory=p.memory)')
worker=worker.replace('if (isDebugLine(text)) console.log(text);',
    "if (isDebugLine(text)) self.postMessage({type:'diagnostic',data:text,heapBytes:self.probeMemory?.buffer.byteLength||0});")
worker=worker.replace("mainScriptUrlOrBlob: assetBase + '/lean.js' + assetQ,",
                      'mainScriptUrlOrBlob: self.probeRuntimeJsUrl,')
worker=worker.replace("importScripts(assetBase + '/lean.js' + assetQ);",
                      "importScripts(self.probeRuntimeJsUrl); self.postMessage({type:'verified_js_consumed'});")
worker=worker.replace('startLeanModule();', '''
    self.probeRuntimeJsUrl = msg.runtimeJsUrl;
    if (!self.probeRuntimeJsUrl?.startsWith('blob:')) throw new Error('Verified runtime JS blob required');
    const verifiedWasm = msg.wasmBinary;
    const originalFetch = self.fetch.bind(self);
    const binaryUrl = new URL(assetBase + '/lean.wasm' + assetQ, location.href).href;
    self.fetch = (request, options) => {
      const url = new URL(typeof request === 'string' ? request : request.url, location.href).href;
      if (url !== binaryUrl) return originalFetch(request, options);
      self.fetch = originalFetch;
      self.postMessage({type:'verified_binary_consumed'});
      return Promise.resolve(new Response(verifiedWasm, {headers:{'Content-Type':'application/wasm'}}));
    };
    startLeanModule();''')
worker += "\nself.addEventListener('message', e=>{if(e.data.type==='memory')self.postMessage({type:'memory',heapBytes:self.probeMemory?.buffer.byteLength||0});});\n"
(out/'viability-worker.js').write_text(worker,encoding='utf-8')
