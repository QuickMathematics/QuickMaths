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
