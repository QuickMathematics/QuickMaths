import {sourceForExperiment} from './compatibility.js';
const status=document.querySelector('#status');
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
let worker,pending,cache,config,runtimeJsUrl,output=[];
window.report={ready:true,done:false,stages:[],proofs:[],assessment_eligible:false,certificate:null};
const report=window.report;
function log(stage,data={}){const event={stage,atMs:performance.now()-report.startMs,...data};report.stages.push(event);status.textContent=JSON.stringify(event,null,2);console.info('QM_LEAN_STAGE '+JSON.stringify(event));}
function command(type,wanted,data={},transfer=[],budget=30000){
  if(pending)throw Error('Concurrent Lean command');
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending=null;worker.terminate();reject(Error(type+' timed out'));},budget);
    pending={wanted,resolve:r=>{clearTimeout(timer);pending=null;resolve(r);},reject:e=>{clearTimeout(timer);pending=null;reject(e);}};
    worker.postMessage({type,...data},transfer);
  });
}
async function artifact(spec){
  const url=new URL('assets/'+spec.file,location.href);
  let response=await cache.match(url),hit=Boolean(response);
  if(!response){response=await fetch(url);if(!response.ok)throw Error('Asset HTTP failure');}
  const bytes=await response.arrayBuffer();
  if(await hash(bytes)!==spec.sha256)throw Error('Asset integrity failure: '+spec.file);
  if(!hit&&report.cacheWritable!==false){
    await cache.put(url,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));
    if(!(await cache.match(url)))report.cacheWritable=false;
  }
  report.assets.push({file:spec.file,compressedBytes:bytes.byteLength,cacheHit:hit});
  return bytes;
}
async function unpack(bytes,expected){
  const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(raw.byteLength!==expected)throw Error('Unpacked size mismatch');return raw;
}
function analyze(result,lines){
  const messages=lines.map(line=>{try{return JSON.parse(line);}catch{return {data:line};}});
  const errors=messages.filter(m=>m.severity==='error'||/uncaught exception|sorryAx|declaration uses 'sorry'/.test(m.data||''));
  const audits=messages.map(m=>/^'(?:_private\.\d+\.)?QuickMathsGenerated\.result' (?:depends on axioms:\s*\[([^\]]*)\]|(does not depend on any axioms))\s*$/.exec(m.data||'')).filter(Boolean);
  const axioms=audits.length===1?(audits[0][1]||'').split(',').map(x=>x.trim()).filter(Boolean):null;
  return {errors,axioms,experimentalKernelSuccess:result.success===true&&errors.length===0&&axioms!==null&&axioms.every(a=>['propext','Classical.choice','Quot.sound'].includes(a))};
}
async function prove(name,source,budget){
  output=[];
  const sourceHash=await hash(new TextEncoder().encode(source)),started=performance.now();
  report.activeProof={name,sourceHash,budgetMs:budget};
  try{
    const result=await command('compile','compile_result',{code:source,path:'/workspace/request.lean'},[],budget);
    const record={name,...result,...analyze(result,output),sourceHash,output:[...output],assessment_eligible:false,certificate:null};
    report.proofs.push(record);log('proof',{name,elapsedMs:result.elapsed,success:record.experimentalKernelSuccess});return record;
  }catch(error){
    report.proofs.push({name,sourceHash,budgetMs:budget,elapsedWallMs:performance.now()-started,error:String(error),output:[...output],experimentalKernelSuccess:false,assessment_eligible:false,certificate:null});
    throw error;
  }finally{report.activeProof=null;}
}
window.startProbe=async()=>{
 try{
  report.startMs=performance.now();report.isolated=crossOriginIsolated;report.assets=[];report.userAgent=navigator.userAgent;
  if(!crossOriginIsolated)throw Error('Cross-origin isolation unavailable');
  config=await(await fetch('assets/viability.json')).json();
  const selectedGroup=new URLSearchParams(location.search).get('group');
  if(selectedGroup&&!Object.hasOwn(config.groups||{},selectedGroup))throw Error('Unknown corpus import group');
  report.selectedGroup=selectedGroup||null;
  const selectedFixtures=selectedGroup?config.fixtures.filter(f=>f.group===selectedGroup):config.fixtures;
  const selectedModules=new Set(selectedGroup?config.groups[selectedGroup].modules:config.modules);
  report.selectedFixtureCount=selectedFixtures.length;
  cache=await caches.open('qm-lean-viability-'+config.identity);
  report.environment=config.environment;report.profile=config.identity;report.corpusCount=config.fixtures.length;report.variant=config.variant||'full';
  const wasm=await unpack(await artifact(config.runtime['lean.wasm']),config.runtime['lean.wasm'].bytes);
  if(await hash(wasm)!==config.runtime['lean.wasm'].rawSha256)throw Error('WASM hash mismatch');
  // Execute the exact verified JS bytes in the classic worker and its pthreads.
  const js=await unpack(await artifact(config.runtime['lean.js']),config.runtime['lean.js'].bytes);
  if(await hash(js)!==config.runtime['lean.js'].rawSha256)throw Error('Runtime JS hash mismatch');
  runtimeJsUrl=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));
  log('runtime-assets-ready');
  const initialMB=new URLSearchParams(location.search).get('initialMB')||'128';
  worker=new Worker('assets/viability-worker.js?assetBase='+encodeURIComponent(new URL('assets',location.href).pathname)+'&initialMB='+encodeURIComponent(initialMB));
  worker.onmessage=({data})=>{
    if(data.type==='diagnostic'){report.diagnostics??=[];report.diagnostics.push(data.data);if(report.diagnostics.length>40)report.diagnostics.shift();report.lastDiagnosticHeapBytes=data.heapBytes;}
    if(data.type==='import_progress')report.importProgress={loaded:data.loaded,total:data.total};
    if(data.type==='verified_binary_consumed')report.verifiedBinaryConsumed=true;
    if(data.type==='verified_js_consumed')report.verifiedJsConsumed=true;
    if(['stdout','stderr'].includes(data.type))output.push(data.data);
    if(data.type==='error')pending?.reject(Error(data.data));else if(data.type===pending?.wanted)pending.resolve(data);
  };
  worker.onerror=e=>pending?.reject(Error(e.message));
  await command('start_worker','worker_ready',{wasmBinary:wasm,runtimeJsUrl},[wasm],120000);
  if(!report.verifiedBinaryConsumed||!report.verifiedJsConsumed)throw Error('Runtime did not consume the verified cached JS/WASM');
  log('runtime-initialized');
  for(const pack of config.packs){
    const needed=pack.entries.filter(e=>selectedModules.has(e.path.replace(/\.(?:olean(?:\.server|\.private)?|ir(?:\.sig)?)$/,'').replaceAll('/','.')));
    if(!needed.length)continue;
    const raw=await unpack(await artifact(pack),pack.bytes);
    const files=[];
    for(const e of needed){
      if(!/^[\w/.-]+$/.test(e.path)||e.path.includes('..')||e.offset<0||e.bytes<0||e.offset+e.bytes>raw.byteLength)throw Error('Invalid packed entry');
      const data=raw.slice(e.offset,e.offset+e.bytes);
      // The SHA-256-verified compressed pack commits to every contained byte.
      // Avoid thousands of redundant cross-process WebCrypto calls on WebKit.
      files.push({name:e.path,data});
    }
    const result=await command('add_files','files_added',{files},files.map(f=>f.data));
    if(result.count!==files.length)throw Error('Incomplete staging');
  }
  log('closure-staged',{modules:selectedModules.size});
  // Each payload was already read, length-counted and hash-verified by artifact().
  // Reading the entire cache a second time would distort the memory benchmark.
  const keys=await cache.keys(),present=new Set(keys.map(k=>new URL(k.url).pathname.split('/').pop()));
  report.cache={bodyBytes:report.assets.filter(a=>present.has(a.file)).reduce((sum,a)=>sum+a.compressedBytes,0),entries:report.assets.filter(a=>present.has(a.file)).length,totalCacheEntries:keys.length,
    expectedBodyBytes:report.assets.reduce((sum,a)=>sum+a.compressedBytes,0),
    missing:report.assets.filter(a=>!present.has(a.file)).map(a=>a.file),
    method:'Present cache keys times their verified compressed payload lengths; excludes browser metadata/overhead'};
  report.cache.complete=report.cache.missing.length===0;
  report.originStorage=navigator.storage?.estimate?await navigator.storage.estimate():{unavailable:true};
  const available=new Set(config.modules),supported=[];report.unsupported=[];
  for(const f of selectedFixtures){
    const adapter=sourceForExperiment(f.source,config.environment);
    const imports=[...adapter.source.matchAll(/^import ([\w.]+)$/gm)].map(m=>m[1]);
    const missing=imports.filter(m=>!available.has(m));
    if(missing.length)report.unsupported.push({name:f.name,missingImports:missing});
    else supported.push({...f,adapted:adapter.source,substitutions:adapter.substitutions});
  }
  report.supportedCount=supported.length;
  const importBudget=Math.min(600000,config.importBudgetMs||120000);
  if(config.scope==='init'){
    await prove('init-only-positive','namespace QuickMathsGenerated\npublic theorem result : True := True.intro\nend QuickMathsGenerated\n#print axioms QuickMathsGenerated.result',importBudget);
    await prove('init-only-negative','namespace QuickMathsGenerated\npublic theorem result : False := by rfl\nend QuickMathsGenerated\n#print axioms QuickMathsGenerated.result',10000);
    report.memory=await command('memory','memory');log('complete-init-control');report.done=true;return;
  }
  if(!supported.length)throw Error('No corpus fixtures fit this closure');
  // Import initialization is measured separately; proof budgets remain request-specific.
  const imports=[...supported[0].adapted.matchAll(/^import [\w.]+$/gm)].map(m=>m[0]).join('\n');
  const warmup=await prove('import-warmup',imports+'\nnamespace QuickMathsGenerated\npublic theorem result : True := True.intro\nend QuickMathsGenerated\n#print axioms QuickMathsGenerated.result',importBudget);
  if(!warmup.experimentalKernelSuccess)throw Error('Import warm-up failed: '+(warmup.error||'missing successful axiom audit'));
  log('ready-to-verify');
  const warmed=new Set([imports]);
  for(const f of supported){
    const header=[...f.adapted.matchAll(/^import [\w.]+$/gm)].map(m=>m[0]).join('\n');
    if(!warmed.has(header)){
      const w=await prove('import-warmup-group-'+warmed.size,header+'\nnamespace QuickMathsGenerated\npublic theorem result : True := True.intro\nend QuickMathsGenerated\n#print axioms QuickMathsGenerated.result',importBudget);
      if(!w.experimentalKernelSuccess)throw Error('Corpus import group failed: '+(w.error||'missing successful axiom audit'));
      warmed.add(header);
    }
    const r=await prove(f.name,f.adapted,f.request.policy.max_seconds*1000);r.substitutions=f.substitutions;
  }
  for(let i=0;i<5;i++)await prove('warm-repeat-'+i,supported[0].adapted,supported[0].request.policy.max_seconds*1000);
  await prove('invalid-control',imports+'\nnamespace QuickMathsGenerated\npublic theorem result : False := by rfl\nend QuickMathsGenerated\n#print axioms QuickMathsGenerated.result',10000);
  report.memory=await command('memory','memory');log('complete');report.done=true;
 }catch(e){report.error=String(e);report.runtimeOutput=output.slice(-30);log('failed',{error:String(e)});report.done=true;worker?.terminate();}
};
window.stopProbe=()=>{worker?.terminate();if(runtimeJsUrl)URL.revokeObjectURL(runtimeJsUrl);};
