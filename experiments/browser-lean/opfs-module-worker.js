// Read-only pack-backed filesystem. Verified raw packs live in temporary OPFS;
// only bounded scratch reads and the Lean-requested WASM mapping enter RAM.
let qmStageDirectory,qmStageRoot;
let qmStageSession;
const qmStageHandles=[];
const qmScratch=new Uint8Array(65536);
self.addEventListener('message',async event=>{
 const msg=event.data;
 if(msg.type==='close_staging'){
  try{
   if(compileBusy)throw Error('Cannot close staging during compilation');
   const count=qmStageHandles.length;
   while(qmStageHandles.length)qmStageHandles.pop().close();
   if(qmStageSession){const area=await qmStageRoot.getDirectoryHandle('qm-lean-experimental-staging');await area.removeEntry(qmStageSession,{recursive:true});}
   qmStageDirectory=null;qmStageSession=null;
   self.postMessage({type:'staging_closed',closedHandles:count,temporaryFilesRemoved:true});
  }catch(error){self.postMessage({type:'error',data:'Staging cleanup failed: '+error});}
  return;
 }
 if(msg.type!=='stage_pack')return;
 try{
  if(compileBusy||!/^[a-f0-9-]{36}$/.test(msg.session)||!/^[a-f0-9]{64}$/.test(msg.pack))throw Error('Invalid disk staging request');
  if(!qmStageDirectory){
   qmStageRoot=await navigator.storage.getDirectory();
   const area=await qmStageRoot.getDirectoryHandle('qm-lean-experimental-staging',{create:true});
   qmStageDirectory=await area.getDirectoryHandle(msg.session,{create:true});
   qmStageSession=msg.session;
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
