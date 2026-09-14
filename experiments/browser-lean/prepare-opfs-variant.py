"""Build a separately versioned disk-backed worker and harness."""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
base=root/'.bridge-runtime/curated-formal'
source=base/'assets-native-eh-tail-pool2-release'
target=base/'assets-a17-opfs-v2';target.mkdir(exist_ok=True)
sha=lambda data:hashlib.sha256(data).hexdigest()
provenance=json.loads((source/'runtime-provenance.json').read_text())
worker=(source/'viability-worker.js').read_bytes()
assert sha(worker)==provenance['workerSha256']
hook=Path(__file__).with_name('opfs-module-worker.js').read_bytes()
worker+=b'\n'+hook
for path in source.iterdir():
 if path.name in {'viability-worker.js','runtime-provenance.json'}:continue
 out=target/path.name
 if not out.exists():out.hardlink_to(path)
 else:assert sha(out.read_bytes())==sha(path.read_bytes())
provenance.update(baselineWorkerSha256=provenance['workerSha256'],workerSha256=sha(worker),opfsHookSha256=sha(hook),purpose='A17 initialization peak: disk-backed verified module packs, bounded scratch reads')
for name,data in [('viability-worker.js',worker),('runtime-provenance.json',(json.dumps(provenance,indent=2)+'\n').encode())]:
 out=target/name
 if out.exists():assert out.read_bytes()==data,'Immutable variant differs; use a new version'
 else:out.write_bytes(data)
harness=Path(__file__).with_name('curated.js').read_text()
start=harness.index('        const raw=await artifact(pack),files=[];')
end=harness.index('\n      }\n      const setupData=',start)
harness=harness[:start]+'''        const raw=await artifact(pack);
        const added=await command('stage_pack','pack_staged',{session:stageSession,pack:pack.rawSha256,raw,entries:pack.entries},[raw],60000);
        if(added.count!==pack.entries.length)throw Error('Incomplete disk-backed module staging');
        log('pack-staged',{file:pack.file,bytes:added.diskBytes,backing:'temporary-opfs'});'''+harness[end:]
harness=harness.replace('let pending,output=[],dead=false,jsUrl;',"let pending,output=[],dead=false,jsUrl;\n  const stageSession=crypto.randomUUID();report.diskStagingSession=stageSession;report.staging='opfs';")
harness=harness.replace('const dispose=()=>{dead=true;worker.terminate();if(jsUrl)URL.revokeObjectURL(jsUrl);};',"""const dispose=async()=>{dead=true;worker.terminate();if(jsUrl)URL.revokeObjectURL(jsUrl);
    try {const root=await navigator.storage.getDirectory();const area=await root.getDirectoryHandle('qm-lean-experimental-staging');
      for(let attempt=0;attempt<10;attempt++){try{await area.removeEntry(stageSession,{recursive:true});break;}
        catch(error){if(error.name==='NotFoundError')break;if(attempt===9)throw error;await new Promise(r=>setTimeout(r,100));}}
    }
    catch(error){if(error.name!=='NotFoundError')report.stagingCleanupError=String(error);}
  };""")
harness=harness.replace('} catch(error) {dispose();throw error;}','} catch(error) {await dispose();throw error;}')
harness="import {slowCases,timingBudget} from './timing-policy.js';\n"+harness
harness=harness.replace('let pending,output=[],dead=false,jsUrl;',"if(report.stagingCleanupError)throw Error('Previous staging cleanup failed; stop and clean up before retrying');\n  let pending,output=[],dead=false,jsUrl;")
harness=harness.replace('const dispose=async()=>{dead=true;', 'let disposal;const dispose=()=>disposal??=(async()=>{dead=true;')
harness=harness.replace("report.stagingCleanupError=String(error);}\n  };", "report.stagingCleanupError=String(error);}\n  })();")
harness=harness.replace("const timer=setTimeout(()=>{pending=null;dispose();reject(Error(type+' timed out'));},budget);", "const timer=setTimeout(async()=>{pending=null;await dispose();reject(Error(type+' timed out'));},budget);")
harness=harness.replace("const invalid=await prove('invalid-control'", "const closed=await command('close_staging','staging_closed',{},[],30000);\n    log('staging-closed',closed);\n    const invalid=await prove('invalid-control'")
harness=harness.replace('} catch(error) {await dispose();throw error;}',"} catch(error) {await dispose();report.error='Environment initialization failed: '+error;throw error;}")
harness=harness.replace('async function prove(name,source,budget) {','async function prove(name,source,budget,originalBudget=budget) {')
harness=harness.replace('report.activeProof={name,sourceHash,budgetMs:budget};','report.activeProof={name,sourceHash,budgetMs:budget,originalBudgetMs:originalBudget,startedAt:Date.now()};')
harness=harness.replace('const record={name,...result,','const record={name,budgetMs:budget,originalBudgetMs:originalBudget,exceededOriginalBudget:result.elapsed>originalBudget,...result,')
harness=harness.replace('const record={name,sourceHash,budgetMs:budget,','const record={name,sourceHash,budgetMs:budget,originalBudgetMs:originalBudget,')
harness=harness.replace("report.memoryProfile=params.get('memoryProfile')==='1';","report.timingMode=params.get('timing')||'standard';timingBudget(report.timingMode,10000);\n    report.memoryProfile=params.get('memoryProfile')==='1';")
harness=harness.replace("report.releaseStaged=params.get('releaseStaged')||'none';","report.releaseStaged=params.get('releaseStaged')||'none';\n    if(report.releaseStaged!=='all')throw Error('OPFS candidate requires releasing all imported staging');")
harness=harness.replace('const selected=config.fixtures.filter(f=>f.group===id&&(!requestedFixture||f.name===requestedFixture));',"const selected=config.fixtures.filter(f=>f.group===id&&(!requestedFixture||f.name===requestedFixture)&&(report.timingMode==='standard'||slowCases.has(f.name)));\n    if(!selected.length)throw Error('No fixtures match this timing mode');\n    report.selectedCaseCount=selected.length;")
harness=harness.replace('fixture.request.policy.max_seconds*1000);','timingBudget(report.timingMode,fixture.request.policy.max_seconds*1000),fixture.request.policy.max_seconds*1000);')
harness=harness.replace('successful.request.policy.max_seconds*1000);','timingBudget(report.timingMode,successful.request.policy.max_seconds*1000),successful.request.policy.max_seconds*1000);')
harness=harness.replace("log('fixture-failed',{name:fixture.name,error:String(error)});await pool.discard();","log('fixture-failed',{name:fixture.name,error:String(error)});await pool.discard();\n        if(report.stagingCleanupError||report.error){report.error=report.error||report.stagingCleanupError;break corpusLoop;}")
harness=harness.replace("||(!report.memoryProfile&&report.releaseStaged!=='none')",'')
harness=harness.replace("if(result.fatalRuntimeError)await pool.discard();","if(result.fatalRuntimeError)await pool.discard();\n        if(report.timingMode==='slow'&&!result.experimentalKernelSuccess){report.error='Stopped after a diagnostic proof failure';break corpusLoop;}")
harness=harness.replace("log('fixture-failed',{name:fixture.name,error:String(error)});await pool.discard();","log('fixture-failed',{name:fixture.name,error:String(error)});await pool.discard();\n        if(report.timingMode==='slow'){report.error='Stopped after diagnostic failure; remaining cases were not retried: '+error;break corpusLoop;}")
harness=harness.replace("report.warmFixture=successful?.name||null;","report.warmFixture=report.timingMode==='slow'?null:successful?.name||null;\n    report.warmRepeatsRequested=report.timingMode==='slow'?0:5;")
harness=harness.replace('if(!report.error&&successful)await pool.withEnvironment',"if(!report.error&&successful&&report.timingMode==='standard')await pool.withEnvironment")
Path(__file__).with_name('curated-opfs.js').write_text(harness)
Path(__file__).with_name('curated-opfs.html').write_text(Path(__file__).with_name('curated.html').read_text().replace('curated.js','curated-opfs.js'))
print(target)
