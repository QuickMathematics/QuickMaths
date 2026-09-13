"""Build a separately versioned disk-backed worker and harness."""
import hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
base=root/'.bridge-runtime/curated-formal'
source=base/'assets-native-eh-tail-pool2-release'
target=base/'assets-a17-opfs-v1';target.mkdir(exist_ok=True)
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
Path(__file__).with_name('curated-opfs.js').write_text(harness)
Path(__file__).with_name('curated-opfs.html').write_text(Path(__file__).with_name('curated.html').read_text().replace('curated.js','curated-opfs.js'))
print(target)
