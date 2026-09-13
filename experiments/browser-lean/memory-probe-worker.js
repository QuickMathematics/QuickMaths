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
