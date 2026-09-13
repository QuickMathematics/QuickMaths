"""Instrument the hash-pinned worker for either isolated browser build profile."""
import hashlib
import argparse
import json
from pathlib import Path
import sys

root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('output',type=Path)
parser.add_argument('--task-workers',type=int,choices=range(1,5))
args=parser.parse_args()
out=args.output;out.mkdir(parents=True,exist_ok=True)
release=json.loads(Path(__file__).with_name('provenance.json').read_text())
worker=(root/'.bridge-runtime/lean-browser/upstream-worker.js').read_text(encoding='utf-8')
if hashlib.sha256(worker.replace('\r\n','\n').encode()).hexdigest()!=release['workerSha256']:
    raise ValueError('Worker pin mismatch')
worker=worker.replace('const candidates = isIOS ? [1024, 768, 512] : [2048, 1536, 1024, 768];',
    "const requested = Number(new URLSearchParams(location.search).get('initialMB') || 128); const candidates = [Math.max(64, Math.min(2048, requested))];")
worker=worker.replace('wasmMemory: p.memory','wasmMemory: (self.probeMemory=p.memory)')
if args.task_workers is not None:
    worker=worker.replace('const resObj = Module._lean_wasm_compile(codeObj, fnameObj);',
                          'const resObj = Module._lean_wasm_compile(codeObj, fnameObj) >>> 0;')
    # Lean returns IO UInt32: on wasm32 both the IO result and UInt32 payload
    # are heap constructors. An IO success is not necessarily compiler success.
    old='return { success: true, elapsed };'
    if worker.count(old)!=1:raise ValueError('Compiler status hook drifted')
    worker=worker.replace(old,"""const boxedStatus = Module.getValue(resObj + 8, 'i32') >>> 0;
    if (!boxedStatus || (boxedStatus & 1)) throw new Error('Unexpected wasm32 UInt32 result ABI');
    const compilerExitCode = Module.getValue(boxedStatus + 8, 'i32') >>> 0;
    return { success: compilerExitCode === 0, compilerExitCode, elapsed };""")
    old="console.error('[COMPILE] threw:', e);\n    return { success: false, error: (e && e.message) || String(e) };"
    if worker.count(old)!=1:raise ValueError('Compiler exception hook drifted')
    worker=worker.replace(old,"console.error('[COMPILE] threw:', e);\n    return { success: false, hostException: true, error: (e && e.message) || String(e), stack: String(e?.stack || '').split('\\n').slice(0, 16).join('\\n') };")
    # The main thread hashes the compressed object before handing over its Blob
    # URL. Stream that committed payload into MEMFS rather than holding another
    # full decompressed snapshot on the main thread.
    changes={
        'Module._lean_wasm_load_snapshot(mkLeanString(p))': 'Module._lean_wasm_load_environment(mkLeanString(p))',
        'loadSnapshot(msg.name, msg.url)': 'loadSnapshot(msg.name, msg.url, msg.compressed, msg.expectedBytes)',
        'async function loadSnapshot(name, url) {': 'async function loadSnapshot(name, url, compressed = false, expectedBytes = 0) {',
        'const reader = response.body.getReader();': "const reader = (compressed ? response.body.pipeThrough(new DecompressionStream('gzip')) : response.body).getReader();",
        "const total = Number(response.headers.get('content-length')) || 0;": "const total = compressed ? expectedBytes : Number(response.headers.get('content-length')) || 0;",
        'FS.write(stream, value, 0, value.length, received);': "if (compressed && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || received + value.length > expectedBytes)) throw new Error('Snapshot size exceeds descriptor');\n      FS.write(stream, value, 0, value.length, received);",
        "FS.close(stream);\n    self.postMessage({ type: 'snapshot_progress'": "FS.close(stream);\n    if (compressed && received !== expectedBytes) throw new Error('Snapshot size mismatch');\n    self.postMessage({ type: 'snapshot_progress'",
    }
    for old,new in changes.items():
        if worker.count(old)!=1:raise ValueError('Snapshot stream hook drifted: '+old)
        worker=worker.replace(old,new)
if args.task_workers is not None:
    old='if (Module._lean_init_task_manager) Module._lean_init_task_manager();'
    if worker.count(old)!=1:raise ValueError('Task manager hook drifted')
    worker=worker.replace(old,f"if (!Module._lean_init_task_manager_using) throw new Error('Bounded task manager unavailable'); Module._lean_init_task_manager_using({args.task_workers}); self.postMessage({{type:'runtime_workers',count:{args.task_workers}}});")
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
