// Persistent Lean WASM host — Web Worker version.
//
// Runs the Lean runtime in a real Worker so the synchronous ~1-minute Init
// import happens OFF the page's main thread (a same-origin iframe shares the
// main thread, which froze the whole tab). Same boot sequence as before; the
// messaging is self.postMessage / self.onmessage instead of parent/iframe.
//
// Initializes the runtime ONCE (without running main(), which would tear it
// down via EXIT_RUNTIME=1) and serves repeated compiles through the fork's
// `lean_wasm_compile` export. The first compile imports Init and caches the
// environment inside Lean; subsequent compiles reuse it.

Error.stackTraceLimit = 1000;

let libraryFiles = [];
let moduleReady = false;
let compileBusy = false;

const assetBase = (new URLSearchParams(location.search).get('assetBase') || '/lean-wasm').replace(/\/$/, '');
// Per-build version, appended to lean.js/lean.wasm so each build is a distinct
// (safely-immutable) CDN URL and a redeploy is picked up without a cache purge.
const assetVer = new URLSearchParams(location.search).get('v') || '';
const assetQ = assetVer ? '?v=' + encodeURIComponent(assetVer) : '';

// The build and wasmCompile emit verbose tracing; keep it out of the UI.
function isDebugLine(text) {
  return /^\s*\[(WASM DEBUG|DEBUG|IFRAME|PROFILE|PWORKER|COMPILE)/.test(text);
}

// Long compile stretches (extension loading, world elaboration) print only
// filtered debug lines, so the page would see total silence for minutes. A
// throttled heartbeat lets the UI distinguish "still computing" from "hung"
// and keeps the inactivity watchdog honest.
let lastActivityPost = 0;
function noteActivity() {
  const now = Date.now();
  if (now - lastActivityPost < 1000) return;
  lastActivityPost = now;
  self.postMessage({ type: 'activity' });
}

// "[DEBUG:PROGRESS] N/506" during the import -> a structured progress event so
// the loading bar can move (and now it actually can, off the main thread).
function reportImportProgress(text) {
  const m = /\[DEBUG:PROGRESS\]\s*(\d+)\/(\d+)/.exec(text);
  if (m) {
    self.postMessage({ type: 'import_progress', loaded: +m[1], total: +m[2] });
    return true;
  }
  // The build also prints bare "  - /lib/lean/<Mod>.olean" lines while loading
  // modules; keep them out of the user-visible output (the one-shot worker
  // filters the same pattern).
  return /^\s*-\s+\/lib\/lean\/.*\.olean\s*$/.test(text);
}

// Start with the largest shared memory this device will grant. The 4.33
// artifacts allow growth up to 4 GiB; desktop can use that headroom without
// increasing its initial allocation. Keep the existing iOS limits.
function pickWasmMemory() {
  const PAGE = 65536;
  // iOS reports allocation success and then jetsam-kills the tab when the
  // pages are actually touched, so don't even attempt desktop-sized commits
  // there — start at 1GB and step down.
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const requested = Number(new URLSearchParams(location.search).get('initialMB') || 128); const candidates = [Math.max(64, Math.min(2048, requested))];
  for (const mb of candidates) {
    try {
      const memory = new WebAssembly.Memory({ initial: (mb * 1024 * 1024) / PAGE, maximum: isIOS ? 32768 : 65536, shared: true });
      if (mb < 2048) console.warn('[MEM] reduced wasm memory: ' + mb + 'MB (device limit)');
      return { memory, bytes: mb * 1024 * 1024 };
    } catch (e) { /* try smaller */ }
  }
  return null; // let Emscripten try its own default and fail loudly
}

function mkdirp(FS, path) {
  let current = '';
  for (const part of path.split('/').filter((p) => p)) {
    current += '/' + part;
    try { FS.mkdir(current); } catch (e) { /* exists */ }
  }
}

function writeLibFile(FS, file) {
  let fileName = file.name;
  for (const prefix of ['library/', 'lean-lib/', 'lib/lean/', 'lean/']) {
    if (fileName.startsWith(prefix)) { fileName = fileName.substring(prefix.length); break; }
  }
  const fullPath = '/lib/lean/' + fileName;
  mkdirp(FS, fullPath.substring(0, fullPath.lastIndexOf('/')));
  FS.writeFile(fullPath, new Uint8Array(file.data));
}

// Build a Lean String from a JS string (EXPORT_ALL exposes the runtime helpers).
function mkLeanString(str) {
  const ptr = Module.stringToNewUTF8(str);
  const obj = Module._lean_mk_string(ptr);
  Module._free(ptr);
  return obj;
}

function compileCode(code, fileName) {
  if (!moduleReady) return { success: false, error: 'Module not ready' };
  if (compileBusy) return { success: false, error: 'Compile already in progress' };
  compileBusy = true;
  const t0 = performance.now();
  try {
    const codeObj = mkLeanString(code);
    const fnameObj = mkLeanString(fileName || '/workspace/input.lean');
    const resObj = Module._lean_wasm_compile(codeObj, fnameObj) >>> 0;
    const elapsed = performance.now() - t0;
    // IO result: ctor tag byte at offset 7 (0 = ok, else error).
    const tag = Module.getValue(resObj + 7, 'i8') & 0xff;
    console.log(`[COMPILE] done in ${elapsed.toFixed(0)}ms (tag ${tag})`);
    if (tag !== 0) {
      try { Module._lean_io_result_show_error(resObj); } catch (e) { /* ignore */ }
      return { success: false, error: 'lean_wasm_compile returned an IO error (see output)', elapsed };
    }
    const boxedStatus = Module.getValue(resObj + 8, 'i32') >>> 0;
    if (!boxedStatus || (boxedStatus & 1)) throw new Error('Unexpected wasm32 UInt32 result ABI');
    const compilerExitCode = Module.getValue(boxedStatus + 8, 'i32') >>> 0;
    return { success: compilerExitCode === 0, compilerExitCode, elapsed };
  } catch (e) {
    console.error('[COMPILE] threw:', e);
    return { success: false, hostException: true, error: (e && e.message) || String(e), stack: String(e?.stack || '').split('\n').slice(0, 16).join('\n') };
  } finally {
    compileBusy = false;
  }
}

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type === 'load_library') {
    libraryFiles = msg.files || [];
    self.postMessage({ type: 'library_received' });
  } else if (msg.type === 'add_files') {
    let written = 0;
    for (const file of (msg.files || [])) {
      try { writeLibFile(Module.FS, file); written++; } catch (e) { /* keep going */ }
    }
    self.postMessage({ type: 'files_added', count: written });
  } else if (msg.type === 'start_worker') {
    
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
    startLeanModule();
  } else if (msg.type === 'compile') {
    self.postMessage({ type: 'compile_result', ...compileCode(msg.code, msg.path) });
  } else if (msg.type === 'load_snapshot') {
    loadSnapshot(msg.name, msg.url, msg.compressed, msg.expectedBytes)
      .then((r) => self.postMessage({ type: 'snapshot_loaded', ...r }))
      .catch((e) => self.postMessage({ type: 'snapshot_loaded', success: false, error: (e && e.message) || String(e) }));
  }
};

// Seed Lean's environment cache from a baked `--incr-header-save` snapshot,
// replacing the multi-minute Init import. The snapshot is githash-paired with
// lean.wasm (its closure relocation is only valid for that binary), which the
// app guarantees by requesting it under the same ?v= as the binary itself.
//
// The worker fetches and streams the file into MEMFS itself: the ~240MB never
// exists as one JS buffer, let alone two (download + structured-clone copy on
// the main thread). Memory-starved tabs — iOS Safari — live or die on that
// peak, and everyone else parses the page while the download proceeds here.
async function loadSnapshot(name, url, compressed = false, expectedBytes = 0) {
  if (!moduleReady) return { success: false, error: 'Module not ready' };
  const t0 = performance.now();
  const FS = Module.FS;
  const p = '/snapshots/' + (name || 'init.snap');
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) return { success: false, error: `snapshot fetch: ${response.status}` };
    const total = compressed ? expectedBytes : Number(response.headers.get('content-length')) || 0;
    try { FS.mkdir('/snapshots'); } catch (e) { /* exists */ }
    const reader = (compressed ? response.body.pipeThrough(new DecompressionStream('gzip')) : response.body).getReader();
    const stream = FS.open(p, 'w');
    let received = 0;
    let lastReport = 0;
    let first = true;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Guard against an SPA fallback page served with 200: snapshots are
      // compacted-region files and start with the olean magic.
      if (first) {
        first = false;
        if (value.length < 5 || value[0] !== 0x6f || value[1] !== 0x6c || value[2] !== 0x65 || value[3] !== 0x61 || value[4] !== 0x6e) {
          FS.close(stream);
          try { FS.unlink(p); } catch (e) { /* ignore */ }
          return { success: false, error: 'snapshot fetch returned non-olean content' };
        }
      }
      if (compressed && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || received + value.length > expectedBytes)) throw new Error('Snapshot size exceeds descriptor');
      FS.write(stream, value, 0, value.length, received);
      received += value.length;
      if (received - lastReport > 8 * 1024 * 1024) {
        lastReport = received;
        self.postMessage({ type: 'snapshot_progress', received, total });
      }
    }
    FS.close(stream);
    if (compressed && received !== expectedBytes) throw new Error('Snapshot size mismatch');
    self.postMessage({ type: 'snapshot_progress', received, total: total || received });
    // The loader reads a `<file>.deps` sidecar; self-contained snapshots use `[]`.
    FS.writeFile(p + '.deps', new Uint8Array([0x5b, 0x5d]));
    const resObj = Module._lean_wasm_load_environment(mkLeanString(p));
    const tag = Module.getValue(resObj + 7, 'i8') & 0xff;
    // The ok value is a UInt32, which wasm32 heap-boxes: field 0 points to a
    // scalar-box object with the payload at +8. 0 = loaded, 1 = load failed.
    const boxPtr = Module.getValue(resObj + 8, 'i32');
    const ret = Module.getValue(boxPtr + 8, 'i32');
    const success = tag === 0 && ret === 0;
    // The MEMFS copy served its purpose; the env holds the loaded region.
    try { FS.unlink(p); FS.unlink(p + '.deps'); } catch (e) { /* ignore */ }
    const elapsed = performance.now() - t0;
    console.log(`[SNAPSHOT] load ${success ? 'ok' : 'FAILED'} in ${elapsed.toFixed(0)}ms (tag ${tag}, ret ${ret})`);
    return { success, elapsed };
  } catch (e) {
    try { FS.unlink(p); } catch (e2) { /* ignore */ }
    console.error('[SNAPSHOT] threw:', e);
    return { success: false, error: (e && e.message) || String(e) };
  }
}

function startLeanModule() {
  self.Module = {
    // Supply the device's initial allocation and maximum to the growable runtime.
    ...(function () { const p = pickWasmMemory(); return p ? { wasmMemory: (self.probeMemory=p.memory), INITIAL_MEMORY: p.bytes } : {}; })(),
    locateFile: (path) => assetBase + '/' + path + assetQ,
    // Tell Emscripten where the runtime script is, so the pthread sub-workers
    // this Worker spawns can load lean.js (the Worker's own script is this file).
    mainScriptUrlOrBlob: self.probeRuntimeJsUrl,
    print: (text) => { noteActivity(); if (reportImportProgress(text)) return; if (isDebugLine(text)) self.postMessage({type:'diagnostic',data:text,heapBytes:self.probeMemory?.buffer.byteLength||0}); else self.postMessage({ type: 'stdout', data: text }); },
    printErr: (text) => { noteActivity(); if (reportImportProgress(text)) return; if (isDebugLine(text)) self.postMessage({type:'diagnostic',data:text,heapBytes:self.probeMemory?.buffer.byteLength||0}); else self.postMessage({ type: 'stderr', data: text }); },
    setStatus: (text) => { if (text) self.postMessage({ type: 'progress', data: text }); },
    noInitialRun: true,

    preRun: [function () {
      const FS = Module.FS;
      Module.ENV['LEAN_PATH'] = '/lib/lean';
      for (const d of ['/lib', '/lib/lean', '/workspace', '/bin']) { try { FS.mkdir(d); } catch (e) { /* exists */ } }
      let errors = 0;
      for (const file of libraryFiles) { try { writeLibFile(FS, file); } catch (e) { errors++; } }
      if (errors > 0) console.error('library write errors:', errors);
      libraryFiles = []; // release the transferred buffers
      try { FS.chdir('/workspace'); } catch (e) { /* ignore */ }
    }],

    onRuntimeInitialized: function () {
      try {
        Module._lean_initialize_runtime_module();
        Module._lean_initialize();
        Module._lean_io_mark_end_initialization();
        if (!Module._lean_init_task_manager_using) throw new Error('Bounded task manager unavailable'); Module._lean_init_task_manager_using(2); self.postMessage({type:'runtime_workers',count:2});
        if (Module._lean_enable_initializer_execution) Module._lean_enable_initializer_execution();
        const spRes = Module._lean_init_search_path();
        if ((Module.getValue(spRes + 7, 'i8') & 0xff) !== 0) {
          try { Module._lean_io_result_show_error(spRes); } catch (e) { /* ignore */ }
          throw new Error('lean_init_search_path failed (see stderr)');
        }
        moduleReady = true;
        self.postMessage({ type: 'worker_ready' });
      } catch (e) {
        self.postMessage({ type: 'error', data: 'Lean init failed: ' + ((e && e.message) || e) });
      }
    },

    onAbort: function (what) {
      moduleReady = false;
      self.postMessage({ type: 'error', data: 'Aborted: ' + (what || 'unknown') });
    },
  };

  try {
    importScripts(self.probeRuntimeJsUrl); self.postMessage({type:'verified_js_consumed'});
  } catch (e) {
    self.postMessage({ type: 'error', data: 'Failed to load lean.js: ' + ((e && e.message) || e) });
  }
}

self.postMessage({ type: 'worker_boot' });

self.addEventListener('message', e=>{if(e.data.type==='memory')self.postMessage({type:'memory',heapBytes:self.probeMemory?.buffer.byteLength||0});});

// Diagnostic instrumentation only; never participates in proof acceptance.
function qmStagedFiles() {
  const files=[];
  function walk(path) {
    const node=Module.FS.lookupPath(path).node;
    if(Module.FS.isDir(node.mode)) {
      for(const name of Module.FS.readdir(path))if(name!=='.'&&name!=='..')walk(path+'/'+name);
    } else if(Module.FS.isFile(node.mode)) {
      files.push({path,bytes:Module.FS.stat(path).size,capacity:node.contents?.byteLength||0});
    }
  }
  walk('/lib/lean');return files;
}
self.addEventListener('message',event=>{
  if(event.data.type!=='profile_memory')return;
  try {
    const files=qmStagedFiles(),byType={};
    for(const file of files) {
      const type=file.path.endsWith('.ir.sig')?'ir.sig':file.path.split('.').pop();
      const row=byType[type]??={files:0,bytes:0,capacity:0};
      row.files++;row.bytes+=file.bytes;row.capacity+=file.capacity;
    }
    self.postMessage({type:'profile_memory',heapBytes:self.probeMemory?.buffer.byteLength||0,
      stagedFiles:files.length,stagedBytes:files.reduce((n,f)=>n+f.bytes,0),
      stagedCapacity:files.reduce((n,f)=>n+f.capacity,0),byType,
      pthreads:{running:self.PThread?.runningWorkers.length,unused:self.PThread?.unusedWorkers.length},
      dynamicLinker:{gotEntries:Object.keys(self.GOT||{}).length,
        wasmExports:Object.keys(self.wasmExports||{}).length,tableSlots:self.wasmTable?.length}});
  } catch(error) {self.postMessage({type:'error',data:'Memory profile failed: '+error});}
});

// Experimental lifetime test, restricted to the already staged module files.
// The imported Lean environment and verified persistent artifact cache remain.
self.addEventListener('message',event=>{
  if(event.data.type!=='release_staged')return;
  try {
    const mode=event.data.mode;
    if(!['olean','all'].includes(mode)||compileBusy)throw Error('Invalid staged-file release');
    const selected=qmStagedFiles().filter(f=>mode==='olean'?f.path.endsWith('.olean'):/\.(?:olean|ir|ir\.sig)$/.test(f.path));
    for(const file of selected)Module.FS.unlink(file.path);
    self.postMessage({type:'released_staged',mode,files:selected.length,bytes:selected.reduce((n,f)=>n+f.bytes,0)});
  } catch(error) {self.postMessage({type:'error',data:'Staged-file release failed: '+error});}
});

// Read-only pack-backed filesystem. Verified raw packs live in temporary OPFS;
// only bounded scratch reads and the Lean-requested WASM mapping enter RAM.
let qmStageDirectory,qmStageRoot;
const qmStageHandles=[];
const qmScratch=new Uint8Array(65536);
self.addEventListener('message',async event=>{
 const msg=event.data;
 if(msg.type!=='stage_pack')return;
 try{
  if(compileBusy||!/^[a-f0-9-]{36}$/.test(msg.session)||!/^[a-f0-9]{64}$/.test(msg.pack))throw Error('Invalid disk staging request');
  if(!qmStageDirectory){
   qmStageRoot=await navigator.storage.getDirectory();
   const area=await qmStageRoot.getDirectoryHandle('qm-lean-experimental-staging',{create:true});
   qmStageDirectory=await area.getDirectoryHandle(msg.session,{create:true});
  }
  const bytes=new Uint8Array(msg.raw);
  for(const entry of msg.entries)if(!/^[\w/.-]+$/.test(entry.path)||entry.path.includes('..')||!Number.isSafeInteger(entry.offset)||!Number.isSafeInteger(entry.bytes)||entry.offset<0||entry.bytes<1||entry.offset+entry.bytes>bytes.length)throw Error('Invalid disk-backed module');
  const file=await qmStageDirectory.getFileHandle(msg.pack,{create:true});
  const handle=await file.createSyncAccessHandle();qmStageHandles.push(handle);
  handle.truncate(bytes.length);
  if(handle.write(bytes,{at:0})!==bytes.length)throw Error('Incomplete disk staging write');
  handle.flush();
  const FS=Module.FS;
  for(const entry of msg.entries){
   const path='/lib/lean/'+entry.path;
   mkdirp(FS,path.slice(0,path.lastIndexOf('/')));
   FS.writeFile(path,new Uint8Array());
   const node=FS.lookupPath(path).node;
   node.usedBytes=entry.bytes;node.contents=null;
   function readInto(buffer,offset,length,position){
    const count=Math.max(0,Math.min(length,entry.bytes-position));let done=0;
    while(done<count){
     const part=Math.min(qmScratch.length,count-done);
     const read=handle.read(qmScratch.subarray(0,part),{at:entry.offset+position+done});
     if(read!==part)throw new FS.ErrnoError(29);
     buffer.set(qmScratch.subarray(0,read),offset+done);done+=read;
    }
    return count;
   }
   node.stream_ops={...node.stream_ops,
    read(stream,buffer,offset,length,position){return readInto(buffer,offset,length,position);},
    write(){throw new FS.ErrnoError(63);},
    mmap(stream,length,position,prot,flags){
     if(!(flags&2)&&(prot&2))throw new FS.ErrnoError(2);
     const ptr=self.mmapAlloc(length);if(!ptr)throw new FS.ErrnoError(48);
     readInto(new Uint8Array(self.probeMemory.buffer),ptr,length,position);
     return {ptr,allocated:true};
    }
   };
  }
  self.postMessage({type:'pack_staged',count:msg.entries.length,diskBytes:bytes.length});
 }catch(error){self.postMessage({type:'error',data:'Disk staging failed: '+error});}
});
