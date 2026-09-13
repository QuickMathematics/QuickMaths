const status = document.querySelector('#status');
const query = new URLSearchParams(location.search);
const report = window.report = {started: new Date().toISOString(), isolated: crossOriginIsolated,
  userAgent: navigator.userAgent, stages: [], proofs: [], assessment_eligible: false, certificate: null};
function log(stage, data = {}) { report.stages.push({stage, atMs: performance.now(), ...data}); status.textContent = JSON.stringify(report, null, 2); }
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2,'0')).join('');
let worker, config, pending;
const output = [];
function command(type, responseType, data = {}, transfer = [], budget = 300000) {
  if (pending) throw Error('Concurrent worker command');
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => { pending=null; worker.terminate(); reject(Error(`${type} exceeded ${budget} ms`)); }, budget);
    pending = {type:responseType, resolve: value => {clearTimeout(timer);pending=null;resolve(value);}, reject: error => {clearTimeout(timer);pending=null;reject(error);}};
    worker.postMessage({type,...data},transfer);
  });
}
async function verifiedFetch(name) {
  const bytes = await (await fetch('assets/'+name)).arrayBuffer();
  if (await hash(bytes) !== config.inventory[name].sha256) throw Error('Asset digest mismatch: '+name);
  return bytes;
}
async function stageLayer(layer) {
  const start=performance.now();
  const manifest=JSON.parse(new TextDecoder().decode(await verifiedFetch(layer+'-layer.json')));
  let compressed=0, raw=0;
  for(const pack of manifest.packs) {
    const bytes=await verifiedFetch(layer+'-lib/'+pack.file); compressed+=bytes.byteLength;
    const unpacked=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if(unpacked.byteLength!==pack.bytes) throw Error('Invalid unpacked length');
    raw+=unpacked.byteLength;
    const files=pack.entries.map(e=>{if(!/^[\w/.-]+$/.test(e.path)||e.path.includes('..')||e.offset+e.bytes>unpacked.byteLength)throw Error('Invalid entry');return {name:e.path,data:unpacked.slice(e.offset,e.offset+e.bytes)};});
    const result=await command('add_files','files_added',{files},files.map(f=>f.data));
    if(result.count!==files.length) throw Error('Incomplete library staging');
  }
  log(layer+'-staged',{elapsedMs:performance.now()-start,compressedBytes:compressed,rawBytes:raw});
}
async function compile(name,source,budget=30000) {
  output.length=0;
  const result=await command('compile','compile_result',{code:source,path:'/workspace/input.lean'},[],budget);
  const lines=[...output];
  const errors=lines.filter(line=>{try{return JSON.parse(line).severity==='error';}catch{return /error:|sorryAx|declaration uses 'sorry'/.test(line);}});
  const messages=lines.map(line=>{try{return JSON.parse(line).data;}catch{return line;}});
  const audit=messages.map(line=>/^'(?:_private\.\d+\.)?QuickMathsGenerated\.result' (?:depends on axioms:\s*\[([^\]]*)\]|(does not depend on any axioms))\s*$/.exec(line)).filter(Boolean);
  const axioms=audit.length===1?(audit[0][1]||'').split(',').map(x=>x.trim()).filter(Boolean):null;
  const record={name,sourceHash:await hash(new TextEncoder().encode(source)),...result,errors,output:lines,
    axioms, experimentalKernelSuccess:result.success===true&&errors.length===0&&axioms!==null&&axioms.every(a=>['propext','Classical.choice','Quot.sound'].includes(a)),
    assessment_eligible:false,certificate:null};
  report.proofs.push(record);log('compile-complete',{name,elapsedMs:result.elapsed,experimentalKernelSuccess:record.experimentalKernelSuccess});
  return record;
}
try {
  if(query.has('shim')&&!crossOriginIsolated) {
    await navigator.serviceWorker.register('coi-sw.js'); await navigator.serviceWorker.ready;
    if(!sessionStorage.shimReload){sessionStorage.shimReload='1';location.reload();} else throw Error('Service-worker isolation did not activate');
  } else {
    if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined') throw Error('Shared-memory runtime requires cross-origin isolation');
    config=await (await fetch('assets/experiment.json')).json();
    report.referenceEnvironment={leanCommit:config.release.leanCommit};
    // Verify immutable runtime bytes before worker execution (HTTP cache reuses these bytes).
    for(const file of ['lean.js','lean.wasm']) await verifiedFetch(file);
    log('runtime-downloaded-and-verified');
    worker=new Worker('assets/worker.js?assetBase='+encodeURIComponent(new URL('assets',location.href).pathname));
    worker.onmessage=({data})=>{if(data.type==='stdout'||data.type==='stderr')output.push(data.data);if(data.type==='error')pending?.reject(Error(data.data));else if(data.type===pending?.type)pending.resolve(data);};
    worker.onerror=e=>pending?.reject(Error(e.message));
    await command('start_worker','worker_ready');log('runtime-initialized');
    await stageLayer('core');
    await compile('init-control','import Init\nnamespace QuickMathsGenerated\ntheorem result : (1:Nat) + 1 = 2 := rfl\nend QuickMathsGenerated\n#print axioms QuickMathsGenerated.result',300000);
    if(!query.has('coreOnly')) {
      await stageLayer('real-analysis');
      for(const fixture of config.fixtures) {
        await compile(fixture.name+'-unchanged',fixture.source,300000);
        // Explicit experimental import-name adapter for the older Mathlib. Never certifies.
        const adapted=fixture.source.replaceAll('Mathlib.Basic.Real.Basic','Mathlib.Data.Real.Basic').replaceAll('import Mathlib.Tactic.Positivity\n','import Mathlib.Tactic.Positivity.Basic\n');
        if(adapted!==fixture.source) await compile(fixture.name+'-import-adapter',adapted,300000);
        if(fixture.name==='guarded_cancellation') for(let i=0;i<3;i++)await compile('warm-cancellation-'+i,adapted);
      }
    }
    await compile('invalid-control','import Init\nnamespace QuickMathsGenerated\ntheorem result : False := by rfl\nend QuickMathsGenerated\n#print axioms QuickMathsGenerated.result');
    report.memory=await command('memory','memory');
    report.resources=performance.getEntriesByType('resource').map(e=>({name:new URL(e.name).pathname,encodedBytes:e.encodedBodySize,decodedBytes:e.decodedBodySize,durationMs:e.duration}));
    log('done');report.done=true;
  }
}catch(error){report.error=String(error);report.done=true;log('failed',{error:String(error)});worker?.terminate();}
