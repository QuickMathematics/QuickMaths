import {sourceForExperiment} from './compatibility.js';
import {createFormalArtifactCache,createFormalEnvironmentPool} from '../app/formal-environment-loader.js';

const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const headerOf=source=>source.split('\n').filter(line=>line==='module'||/^(?:public )?import [\w.]+$/.test(line)).join('\n');
const control=(header,body)=>header+'\nnamespace QuickMathsGenerated\npublic theorem result : '+body+'\nend QuickMathsGenerated\n#print axioms QuickMathsGenerated.result';
window.report={ready:true,done:false,stages:[],proofs:[],matrix:[],assets:[],assessment_eligible:false,certificate:null};
const report=window.report;
let pool,artifactCache,config;
function log(stage,data={}) {
  const event={stage,atMs:performance.now()-report.startMs,...data};report.stages.push(event);
  document.querySelector('#status').textContent=JSON.stringify(event,null,2);
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
  let pending,output=[],dead=false,jsUrl;
  const worker=new Worker('assets/viability-worker.js?assetBase='+encodeURIComponent(new URL('assets',location.href).pathname)+'&initialMB=128');
  const dispose=()=>{dead=true;worker.terminate();if(jsUrl)URL.revokeObjectURL(jsUrl);};
  const command=(type,wanted,data={},transfer=[],budget=30000)=>new Promise((resolve,reject)=>{
    if(dead||pending){reject(Error('Verifier worker unavailable'));return;}
    const timer=setTimeout(()=>{pending=null;dispose();reject(Error(type+' timed out'));},budget);
    pending={wanted,resolve:r=>{clearTimeout(timer);pending=null;resolve(r);},reject:e=>{clearTimeout(timer);pending=null;reject(e);}};
    worker.postMessage({type,...data},transfer);
  });
  let consumedWasm=false,consumedJs=false;
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
  async function prove(name,source,budget) {
    output=[];const sourceHash=await hash(new TextEncoder().encode(source)),started=performance.now();
    report.activeProof={name,sourceHash,budgetMs:budget};
    try {
      const result=await command('compile','compile_result',{code:source,path:'/workspace/request.lean'},[],budget);
      const record={name,...result,...analyze(result,output),sourceHash,output:[...output],assessment_eligible:false,certificate:null};
      record.fatalRuntimeError=result.hostException===true||/call stack|out of bounds|unreachable|indirect call|out of memory/i.test(result.error||'');
      if(record.fatalRuntimeError)dispose();
      report.proofs.push(record);log('proof',{name,elapsedMs:result.elapsed,success:record.experimentalKernelSuccess});return record;
    } catch(error) {
      const record={name,sourceHash,budgetMs:budget,elapsedWallMs:performance.now()-started,error:String(error),output:[...output],experimentalKernelSuccess:false,assessment_eligible:false,certificate:null};
      report.proofs.push(record);throw error;
    } finally {report.activeProof=null;}
  }
  try {
    const wasm=await artifact(config.runtime['lean.wasm']);
    const js=await artifact(config.runtime['lean.js']);
    jsUrl=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));log('runtime-assets-ready',{environment:profile.id,format});
    await command('start_worker','worker_ready',{wasmBinary:wasm,runtimeJsUrl:jsUrl},[wasm],120000);
    if(!consumedWasm||!consumedJs)throw Error('Runtime did not consume verified bytes');
    log('runtime-initialized');
    if(format==='modules') {
      for(const pack of config.packs.filter(p=>p.profiles.includes(profile.id))) {
        const raw=await artifact(pack),files=[];
        for(const entry of pack.entries) {
          if(!/^[\w/.-]+$/.test(entry.path)||entry.path.includes('..')||!Number.isSafeInteger(entry.offset)||!Number.isSafeInteger(entry.bytes)||entry.offset<0||entry.bytes<1||entry.offset+entry.bytes>raw.byteLength)throw Error('Invalid module entry');
          files.push({name:entry.path,data:raw.slice(entry.offset,entry.offset+entry.bytes)});
        }
        const added=await command('add_files','files_added',{files},files.map(f=>f.data));
        if(added.count!==files.length)throw Error('Incomplete module staging');
      }
      const setupData=new TextEncoder().encode(JSON.stringify(profile.setup)).buffer;
      await command('add_files','files_added',{files:[{name:'qm-setup.json',data:setupData}]},[setupData]);
      log('closure-staged',{modules:profile.modules.length});
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
    const source=config.fixtures.find(f=>f.group===profile.id).source;
    const header=headerOf(source);
    const warmup=await prove('import-warmup',control(header,'True := True.intro'),config.importBudgetMs);
    if(!warmup.experimentalKernelSuccess)throw Error('Import warm-up failed');
    log('ready-to-verify');
    const invalid=await prove('invalid-control',control(header,'False := by rfl'),10000);
    const sorry=await prove('sorry-control',control(header,'False := by sorry'),10000);
    if(invalid.experimentalKernelSuccess||sorry.experimentalKernelSuccess||invalid.fatalRuntimeError||sorry.fatalRuntimeError)
      throw Error('Kernel rejection control failed');
    return {dispose,prove,header,memory:()=>command('memory','memory'),get dead(){return dead;}};
  } catch(error) {dispose();throw error;}
}
window.startProbe=async()=>{
  report.startMs=performance.now();report.isolated=crossOriginIsolated;report.userAgent=navigator.userAgent;
  try {
    if(!crossOriginIsolated)throw Error('Cross-origin isolation unavailable');
    config=await(await fetch('assets/viability.json')).json();
    const params=new URLSearchParams(location.search),id=params.get('group'),format=params.get('mode')||'modules';
    if(!Object.hasOwn(config.profiles,id))throw Error('Choose a versioned environment');
    report.selectedGroup=id;report.format=format;report.profile=config.identity;report.environment=config.environment;
    const cache=await caches.open('qm-formal-artifacts-v1');
    artifactCache=createFormalArtifactCache({cache,baseUrl:new URL('assets/',location.href)});
    pool=createFormalEnvironmentPool({catalog:config.profiles,create:createRuntime});
    // Every fixture receives an explicit route result. A different canonical
    // header requires its own environment, never a silently broadened import.
    for(const fixture of config.fixtures) {
      if(fixture.group!==id)report.matrix.push({name:fixture.name,status:'different_environment_required',environment:fixture.group,assessment_eligible:false,certificate:null});
    }
    for(const negative of config.negatives)report.matrix.push({name:negative.name,status:negative.actual,stage:negative.stage,evidence:'curated-corpus.py production preflight; no kernel invocation',assessment_eligible:false,certificate:null});
    const requestedFixture=params.get('fixture');
    if(requestedFixture&&!config.fixtures.some(f=>f.group===id&&f.name===requestedFixture))throw Error('Unknown diagnostic fixture');
    report.diagnosticFixture=requestedFixture;
    const rounds=Number(params.get('rounds')||1);
    if(!Number.isInteger(rounds)||rounds<1||rounds>5)throw Error('Invalid corpus repetition count');
    report.corpusRounds=rounds;
    for(const fixture of config.fixtures.filter(f=>f.group===id&&requestedFixture&&f.name!==requestedFixture))
      report.matrix.push({name:fixture.name,status:'not_run_diagnostic',assessment_eligible:false,certificate:null});
    const selected=config.fixtures.filter(f=>f.group===id&&(!requestedFixture||f.name===requestedFixture));
    corpusLoop: for(let round=0;round<rounds;round++) for(const fixture of selected) {
      try {
        const result=await pool.withEnvironment(id,format,async runtime=>{
          const adapted=sourceForExperiment(fixture.source,config.environment);
          if(headerOf(adapted.source)!==runtime.header)throw Error('Canonical source header mismatch');
          return runtime.prove(fixture.name,adapted.source,fixture.request.policy.max_seconds*1000);
        });
        result.corpusRound=round;
        report.matrix.push({name:fixture.name,round,status:result.experimentalKernelSuccess?'kernel_success':'kernel_failure',assessment_eligible:false,certificate:null});
        if(result.fatalRuntimeError)await pool.discard();
      } catch(error) {
        report.matrix.push({name:fixture.name,round,status:'runtime_failure',error:String(error),assessment_eligible:false,certificate:null});
        log('fixture-failed',{name:fixture.name,error:String(error)});await pool.discard();
        // A failed environment initialization is a shared prerequisite failure,
        // not 100 individually run proofs. Record all remaining cases explicitly.
        if(!report.stages.some(s=>s.stage==='ready-to-verify')) {
          for(const remaining of selected.filter(f=>!report.matrix.some(r=>r.name===f.name)))
            report.matrix.push({name:remaining.name,status:'blocked_environment_initialization',assessment_eligible:false,certificate:null});
          report.error=String(error);break corpusLoop;
        }
      }
    }
    const slowest=report.proofs.filter(p=>selected.some(f=>f.name===p.name)&&p.experimentalKernelSuccess)
      .sort((a,b)=>(b.elapsed||0)-(a.elapsed||0))[0];
    const successful=selected.find(f=>f.name===slowest?.name);
    report.warmFixture=successful?.name||null;
    report.warmSelection='slowest successful canonical proof';
    if(!report.error&&successful)await pool.withEnvironment(id,format,async runtime=>{
      for(let i=0;i<5;i++) {
        const result=await runtime.prove('warm-repeat-'+i,successful.source,successful.request.policy.max_seconds*1000);
        if(!result.experimentalKernelSuccess) {report.error='Warm verification failed: '+(result.error||'kernel rejection');break;}
      }
      if(!runtime.dead)report.memory=await runtime.memory();
    });
    const keys=await cache.keys(),present=new Set(keys.map(k=>new URL(k.url).pathname.split('/').pop()));
    const unique=[...new Map(report.assets.map(a=>[a.cacheKey,a])).values()];
    report.cache={...artifactCache.stats,bodyBytes:unique.filter(a=>present.has(a.cacheKey)).reduce((n,a)=>n+a.compressedBytes,0),entries:unique.length,complete:unique.every(a=>present.has(a.cacheKey)),method:'Verified compressed body lengths; excludes browser metadata'};
    report.originStorage=await navigator.storage.estimate();
    log('complete',{matrixRows:report.matrix.length});report.done=true;
  } catch(error) {report.error=String(error);log('failed',{error:String(error)});report.done=true;await pool?.discard();}
};
window.stopProbe=()=>pool?.dispose();
