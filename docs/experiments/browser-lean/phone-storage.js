const directoryName='qm-lean-experimental-staging';
function requireStorage(){
 if(typeof navigator.storage?.estimate!=='function'||typeof navigator.storage?.getDirectory!=='function')
  throw Error('This browser does not expose the storage APIs required by the experimental Lean runner. Try a current browser with origin-private filesystem support. No proof test has started.');
}
export async function withTestLock(action){
 if(!navigator.locks)throw Error('This experimental runner requires Web Locks. Use current Chrome.');
 return navigator.locks.request('qm-browser-lean-phone-test',{ifAvailable:true},lock=>{
  if(!lock)throw Error('Another experimental test tab is active. Stop it or close it first.');
  return action();
 });
}
export async function storageStatus(){
 requireStorage();
 const estimate=await navigator.storage.estimate();let temporaryDirectories=0;
 try{const root=await navigator.storage.getDirectory();const area=await root.getDirectoryHandle(directoryName);for await(const name of area.keys())temporaryDirectories++;}
 catch(error){if(error.name!=='NotFoundError')throw error;}
 return {at:new Date().toISOString(),...estimate,temporaryDirectories};
}
export async function clearTemporaryStaging(){
 requireStorage();
 const root=await navigator.storage.getDirectory();
 try{await root.removeEntry(directoryName,{recursive:true});}
 catch(error){if(error.name!=='NotFoundError')throw Error('Temporary staging is still locked. Close older experimental tabs, then retry cleanup. '+error);}
 return storageStatus();
}
