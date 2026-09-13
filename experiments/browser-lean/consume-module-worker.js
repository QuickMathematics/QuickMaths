// Experimental import lifetime reduction. Preserve bytes until a complete read
// or copied mmap has finished and the last descriptor closes. No proof changes.
const qmOriginalMessage=self.onmessage;
let qmLifetimeInstalled=false;
self.onmessage=event=>{
 if(event.data?.type==='compile'&&!qmLifetimeInstalled){
  qmLifetimeInstalled=true;
  const FS=Module.FS,read=FS.read,close=FS.close,mmap=FS.mmap;
  const consumed=new WeakMap();let releasedBytes=0,releasedFiles=0;
  const eligible=s=>s?.path?.startsWith('/lib/lean/')&&/\.(olean|ir|ir\.sig)$/.test(s.path);
  FS.read=function(stream,buffer,offset,length,position){
   const start=position===undefined?stream.position:position;
   const count=read.apply(this,arguments);
   if(eligible(stream)){const end=consumed.get(stream)||0;if(start<=end)consumed.set(stream,Math.max(end,start+count));}
   return count;
  };
  FS.mmap=function(stream,length,position){
   const result=mmap.apply(this,arguments);
   // allocated mmap is a copy in WASM memory, not an alias of the file buffer.
   if(eligible(stream)&&result.allocated&&position===0)consumed.set(stream,length);
   return result;
  };
  FS.close=function(stream){
   const path=stream.path,node=stream.node,size=node?.usedBytes;
   const complete=eligible(stream)&&Number.isSafeInteger(size)&&size>0&&(consumed.get(stream)||0)>=size;
   const result=close.apply(this,arguments);
   if(complete&&!FS.streams.some(s=>s?.node===node)){
    FS.unlink(path);releasedBytes+=size;releasedFiles++;
    if(releasedFiles%100===0)self.postMessage({type:'diagnostic',data:{stage:'module-consumed',releasedFiles,releasedBytes,path},heapBytes:self.probeMemory?.buffer.byteLength||0});
   }
   return result;
  };
 }
 return qmOriginalMessage(event);
};
