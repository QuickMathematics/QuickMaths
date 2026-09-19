import pins from './pins.js';
import {createFormalArtifactCache,createFormalEnvironmentPool} from '../formal-environment-loader.js';
let onStatus=()=>{};
async function verified(url,spec){const r=await fetch(url);if(!r.ok)throw Error('Verifier asset unavailable');const b=await r.arrayBuffer();if(b.byteLength!==spec.bytes||await hash(b)!==spec.sha256)throw Error('Verifier integrity mismatch');return b;}
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const headerOf=source=>source.split('\n').filter(line=>line==='module'||/^(?:public )?import [\w.]+$/.test(line)).join('\n');
const control=(header,body)=>header+'\nnamespace QuickMathsGenerated\npublic theorem result : '+body+'\nend QuickMathsGenerated\n#print axioms QuickMathsGenerated.result';
const report={startMs:performance.now(),stages:[],proofs:[],assets:[],releaseStaged:'all'};
let pool,artifactCache,config;
function log(stage,data={}) {
  const event={stage,atMs:performance.now()-report.startMs,...data};report.stages.push(event);
  onStatus(stage); if(report.stages.length>30)report.stages.shift();
}
async function artifact(spec) {
  const result=await artifactCache.read(spec);
  report.assets.push({file:spec.file,cacheKey:result.cacheKey,compressedBytes:spec.compressedBytes,cacheHit:result.cacheHit});
  const raw=await new Response(result.blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(raw.byteLength!==spec.bytes||await hash(raw)!==spec.rawSha256)throw Error('Unpacked artifact integrity failure');
  return raw;
}
function analyze(result,output) {
  const messages=output.map(line=>{try{return JSON.parse(line);}catch{return {data:line};}});
  const errors=messages.filter(m=>m.severity==='error'||/uncaught exception|sorryAx|declaration uses 'sorry'/.test(m.data||''));
  const audits=messages.map(m=>/^'QuickMathsGenerated\.result' (?:depends on axioms:\s*\[([^\]]*)\]|(does not depend on any axioms))\s*$/.exec(m.data||'')).filter(Boolean);
  const axioms=audits.length===1?(audits[0][1]||'').split(',').map(x=>x.trim()).filter(Boolean):null;
  return {errors,axioms,experimentalKernelSuccess:result.success===true&&!errors.length&&axioms!==null&&axioms.every(a=>['propext','Classical.choice','Quot.sound'].includes(a))};
}
async function createRuntime(profile,format) {
  if(report.stagingCleanupError)throw Error('Previous staging cleanup failed; stop and clean up before retrying');
  let pending,output=[],dead=false,jsUrl;
  const stageSession=crypto.randomUUID();report.diskStagingSession=stageSession;report.staging='opfs';
  const workerUrl=new URL('../experiments/browser-lean/assets/viability-worker.js',import.meta.url);
  const workerBytes=await verified(workerUrl,pins.worker);
  const workerText=new TextDecoder().decode(workerBytes).replaceAll('location.href','qmLocation.href').replaceAll('location.search','qmLocation.search');
  const blobUrl=URL.createObjectURL(new Blob(['const qmLocation='+JSON.stringify({href:workerUrl.href,search:'?assetBase='+encodeURIComponent(new URL('./',workerUrl).href)+'&initialMB=128'})+';\n',workerText],{type:'text/javascript'}));
  const worker=new Worker(blobUrl); URL.revokeObjectURL(blobUrl);
  let disposal;const dispose=()=>disposal??=(async()=>{dead=true;worker.terminate();if(jsUrl)URL.revokeObjectURL(jsUrl);
    try {const root=await navigator.storage.getDirectory();const area=await root.getDirectoryHandle('qm-lean-experimental-staging');
      for(let attempt=0;attempt<10;attempt++){try{await area.removeEntry(stageSession,{recursive:true});break;}
        catch(error){if(error.name==='NotFoundError')break;if(attempt===9)throw error;await new Promise(r=>setTimeout(r,100));}}
    }
    catch(error){if(error.name!=='NotFoundError')report.stagingCleanupError=String(error);}
  })();
  const command=(type,wanted,data={},transfer=[],budget=30000)=>new Promise((resolve,reject)=>{
    if(dead||pending){reject(Error('Verifier worker unavailable'));return;}
    const timer=setTimeout(async()=>{pending=null;await dispose();reject(Error(type+' timed out'));},budget);
    pending={wanted,resolve:r=>{clearTimeout(timer);pending=null;resolve(r);},reject:e=>{clearTimeout(timer);pending=null;reject(e);}};
    worker.postMessage({type,...data},transfer);
  });
  let consumedWasm=false,consumedJs=false;
  async function profileMemory(phase) {
    if(!report.memoryProfile)return;
    const memory=await command('profile_memory','profile_memory');
    // Let the external private-page sampler observe a stable idle phase.
    await new Promise(resolve=>setTimeout(resolve,2500));
    log('memory-phase',{phase,holdingMs:2500,...memory});
  }
  worker.onmessage=({data})=>{
    if(data.type==='verified_binary_consumed')consumedWasm=true;
    if(data.type==='verified_js_consumed')consumedJs=true;
    if(['stdout','stderr'].includes(data.type))output.push(data.data);
    if(data.type==='diagnostic') {report.diagnostics??=[];report.diagnostics.push(data.data);if(report.diagnostics.length>40)report.diagnostics.shift();report.lastDiagnosticHeapBytes=data.heapBytes;}
    if(data.type==='import_progress')report.importProgress={loaded:data.loaded,total:data.total};
    if(data.type==='runtime_workers')report.taskWorkers=data.count;
    if(data.type==='error')pending?.reject(Error(data.data));else if(data.type===pending?.wanted)pending.resolve(data);
  };
  worker.onerror=e=>pending?.reject(Error(e.message));
  async function prove(name,source,budget,originalBudget=budget) {
    output=[];const sourceHash=await hash(new TextEncoder().encode(source)),started=performance.now();
    report.activeProof={name,sourceHash,budgetMs:budget,originalBudgetMs:originalBudget,startedAt:Date.now()};
    try {
      const result=await command('compile','compile_result',{code:source,path:'/workspace/request.lean'},[],budget);
      const record={name,budgetMs:budget,originalBudgetMs:originalBudget,exceededOriginalBudget:result.elapsed>originalBudget,...result,...analyze(result,output),sourceHash,output:[...output],assessment_eligible:false,certificate:null};
      record.fatalRuntimeError=result.hostException===true||/call stack|out of bounds|unreachable|indirect call|out of memory/i.test(result.error||'');
      if(record.fatalRuntimeError)dispose();
      report.proofs=[record];log('proof',{name,elapsedMs:result.elapsed,success:record.experimentalKernelSuccess});return record;
    } catch(error) {
      const record={name,sourceHash,budgetMs:budget,originalBudgetMs:originalBudget,elapsedWallMs:performance.now()-started,error:String(error),output:[...output],experimentalKernelSuccess:false,assessment_eligible:false,certificate:null};
      report.proofs=[record];throw error;
    } finally {report.activeProof=null;}
  }
  try {
    const wasm=await artifact(config.runtime['lean.wasm']);
    const js=await artifact(config.runtime['lean.js']);
    jsUrl=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));log('runtime-assets-ready',{environment:profile.id,format});
    await command('start_worker','worker_ready',{wasmBinary:wasm,runtimeJsUrl:jsUrl},[wasm],120000);
    if(!consumedWasm||!consumedJs)throw Error('Runtime did not consume verified bytes');
    log('runtime-initialized');
    await profileMemory('runtime-initialized');
    if(format==='modules') {
      for(const pack of config.packs.filter(p=>p.profiles.includes(profile.id))) {
        const raw=await artifact(pack);
        const added=await command('stage_pack','pack_staged',{session:stageSession,pack:pack.rawSha256,raw,entries:pack.entries},[raw],60000);
        if(added.count!==pack.entries.length)throw Error('Incomplete disk-backed module staging');
        log('pack-staged',{file:pack.file,bytes:added.diskBytes,backing:'temporary-opfs'});
      }
      const setupData=new TextEncoder().encode(JSON.stringify(profile.setup)).buffer;
      await command('add_files','files_added',{files:[{name:'qm-setup.json',data:setupData}]},[setupData]);
      log('closure-staged',{modules:profile.modules.length});
      await profileMemory('closure-staged');
    } else {
      const snapshot=config.snapshots[profile.id];
      if(!snapshot)throw Error('No successful exact-WASM snapshot for this environment');
      const binding=snapshot.build.binding;
      const header='module\n'+profile.imports.map(m=>'public import '+m).join('\n')+'\n\n#check True\n';
      if(binding.format!=='qm-environment-v1'||binding.profile!==profile.id||binding.wasm!==config.runtime['lean.wasm'].rawSha256||binding.js!==config.runtime['lean.js'].rawSha256||binding.header!==await hash(new TextEncoder().encode(header)))throw Error('Snapshot/runtime/header binding mismatch');
      const verified=await artifactCache.read(snapshot);
      report.assets.push({file:snapshot.file,cacheKey:verified.cacheKey,compressedBytes:snapshot.compressedBytes,cacheHit:verified.cacheHit});
      const url=URL.createObjectURL(verified.blob);
      try {
        const result=await command('load_snapshot','snapshot_loaded',{name:'header.snap',url,compressed:true,expectedBytes:snapshot.bytes},[],config.importBudgetMs);
        if(!result.success)throw Error('Exact snapshot load failed: '+result.error);
        log('snapshot-loaded',{elapsedMs:result.elapsed});
      } finally {URL.revokeObjectURL(url);}
    }
    const header='module\n'+profile.imports.map(m=>'public import '+m).join('\n');
    const warmup=await prove('import-warmup',control(header,'True := True.intro'),config.importBudgetMs);
    if(!warmup.experimentalKernelSuccess)throw Error('Import warm-up failed');
    log('ready-to-verify');
    await profileMemory('imports-ready');
    if(report.releaseStaged!=='none') {
      const released=await command('release_staged','released_staged',{mode:report.releaseStaged});
      log('staged-files-released',released);
      await profileMemory('staged-files-released');
    }
    const closed=await command('close_staging','staging_closed',{},[],30000);
    log('staging-closed',closed);
    const invalid=await prove('invalid-control',control(header,'False := by rfl'),10000);
    const sorry=await prove('sorry-control',control(header,'False := by sorry'),10000);
    if(invalid.experimentalKernelSuccess||sorry.experimentalKernelSuccess||invalid.fatalRuntimeError||sorry.fatalRuntimeError)
      throw Error('Kernel rejection control failed');
    return {dispose,prove,header,profileMemory,memory:()=>command('memory','memory'),get dead(){return dead;}};
  } catch(error) {await dispose();report.error='Environment initialization failed: '+error;throw error;}
}

let initialized;
async function initialize(){
 if(!initialized)initialized=(async()=>{config=JSON.parse(new TextDecoder().decode(await verified(new URL('./catalog.json',import.meta.url),pins['catalog.json'])));artifactCache=createFormalArtifactCache({cache:await caches.open('qm-formal-artifacts-v1'),baseUrl:new URL('../experiments/browser-lean/assets/',import.meta.url).href});pool=createFormalEnvironmentPool({catalog:config.profiles,create:createRuntime});})();
 return initialized;
}
export async function runKernel(source,seconds,status=()=>{}){
 onStatus=status;await initialize();const header=headerOf(source);
 const profile=Object.values(config.profiles).find(p=>header==='module\n'+p.imports.map(m=>'public import '+m).join('\n'));
 if(!profile)throw Error('This combination of formal capabilities is not available in the browser yet.');
 return pool.withEnvironment(profile.id,'modules',runtime=>runtime.prove('submitted-proof',source,Math.min(60,seconds)*1000));
}
export async function releaseKernel(){await pool?.dispose();pool=null;initialized=null;}
