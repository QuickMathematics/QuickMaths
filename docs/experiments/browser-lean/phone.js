import {withTestLock,storageStatus,clearTemporaryStaging} from './phone-storage.js';
const $=id=>document.getElementById(id);
const key='qm-browser-lean-phone-results-v1';
let running=false,frame,results,cancelLoad;
try{results=JSON.parse(localStorage.getItem(key))||{runs:[]};}catch{results={runs:[]};}
const save=()=>{try{localStorage.setItem(key,JSON.stringify(results));}catch{}};
const status=text=>{$('status').textContent=text;};
const showStorage=s=>{$('storage').textContent='Origin storage: '+((s.usage||0)/2**30).toFixed(2)+' GiB · temporary directories: '+s.temporaryDirectories;};
$('mode').onchange=()=>{if($('mode').value==='slow')$('group').value='qm-formal-v1-bb0d3439bce63261';$('group').disabled=$('mode').value==='slow';};
$('mode').onchange();
const digest=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function checkPins(){
 const pins=await(await fetch('deployment-pins.json',{cache:'no-store'})).json();
 for(const [path,pin] of Object.entries(pins)){
  const response=await fetch(path,{cache:'no-cache'});
  if(!response.ok||await digest(await response.arrayBuffer())!==pin)throw Error('Deployment integrity mismatch: '+path);
 }
 return pins;
}
async function isolate(){
 if(!isSecureContext||!('serviceWorker' in navigator))throw Error('HTTPS and service workers are required. Open this page in Chrome.');
 const scope=new URL('./',location.href).href;
 await navigator.serviceWorker.register('coi-sw.js',{scope,updateViaCache:'none'});
 if(!crossOriginIsolated){
  for(let i=0;i<100;i++){
   if(navigator.serviceWorker.controller?.scriptURL===new URL('coi-sw.js',scope).href)break;
   await new Promise(r=>setTimeout(r,100));
  }
  if(sessionStorage.getItem('qm-isolation-reload')===location.pathname)throw Error('Isolation unavailable after reload. Close this tab and reopen the experimental URL in Chrome.');
  sessionStorage.setItem('qm-isolation-reload',location.pathname);location.reload();return false;
 }
 sessionStorage.removeItem('qm-isolation-reload');return true;
}
async function dispose(){
 const old=frame;frame=null;let session;
 try{session=old?.contentWindow.report?.diskStagingSession;old?.contentWindow.stopProbe?.();}catch{}
 old?.remove();
 if(!/^[a-f0-9-]{36}$/.test(session||''))return;
 try{const root=await navigator.storage.getDirectory();const area=await root.getDirectoryHandle('qm-lean-experimental-staging');
  for(let i=0;i<20;i++){try{await area.removeEntry(session,{recursive:true});return;}catch(error){if(error.name==='NotFoundError')return;if(i===19)throw error;await new Promise(r=>setTimeout(r,100));}}
 }catch(error){if(error.name!=='NotFoundError'){results.cleanupError=String(error);save();}}
}
$('stop').onclick=async()=>{running=false;cancelLoad?.();await dispose();results.interrupted=true;save();status('Stopped. Partial results can be exported.');};
$('cleanup').onclick=async()=>{if(running)return;try{await withTestLock(async()=>{status('Removing old temporary staging…');const s=await clearTemporaryStaging();showStorage(s);results.storageAfterManualCleanup=s;save();status('Temporary staging removed. Shared verified downloads and workspace data were kept.');});}catch(error){status(String(error));}};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(results,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='quickmaths-phone-lean-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
async function runSuite(){
 if(running)return;running=true;$('start').disabled=true;$('cleanup').disabled=true;$('stop').disabled=false;
 const timing=$('mode').value;
 results={started:new Date().toISOString(),timingMode:timing,userAgent:navigator.userAgent,isolated:crossOriginIsolated,deviceMemoryGiB:navigator.deviceMemory??null,assessment_eligible:false,certificate:null,runs:[]};save();
 try{
  results.storageBeforeCleanup=await storageStatus();showStorage(results.storageBeforeCleanup);save();
  status('Removing leftover experimental staging before starting…');
  results.storageAfterCleanup=await clearTemporaryStaging();showStorage(results.storageAfterCleanup);save();
  status('Verifying deployment identity…');results.pins=await checkPins();save();
  const groups=timing==='slow'?['qm-formal-v1-bb0d3439bce63261']:$('group').value==='all'?[...$('group').options].map(o=>o.value).filter(v=>v!=='all'):[$('group').value];
  for(const group of groups){
   if(!running)break;await dispose();frame=document.createElement('iframe');
   frame.src='runner.html?'+new URLSearchParams({group,mode:'modules',timing,rounds:timing==='slow'?'1':'3',memoryProfile:timing==='slow'?'0':'1',releaseStaged:'all'});
   $('frame').append(frame);
   await new Promise((resolve,reject)=>{cancelLoad=resolve;frame.onload=resolve;frame.onerror=()=>reject(Error('Runner failed to load'));});cancelLoad=null;
   while(running&&!frame.contentWindow.startProbe)await new Promise(r=>setTimeout(r,100));
   if(!running)break;
   frame.contentWindow.startProbe();
   while(running){
    const report=frame.contentWindow.report;
    results.active={group,staging:report.staging,stage:report.stages.at(-1),proof:report.activeProof,importProgress:report.importProgress,wasmCapacityBytes:report.lastDiagnosticHeapBytes,at:new Date().toISOString()};save();
    status((report.activeProof?'Current proof: '+report.activeProof.name+' · '+Math.max(0,(Date.now()-report.activeProof.startedAt)/1000).toFixed(1)+' s / '+report.activeProof.budgetMs/1000+' s\n':'')+JSON.stringify(results.active,null,2));
    if(report.done){results.runs.push(JSON.parse(JSON.stringify(report)));delete results.active;save();break;}
    await new Promise(r=>setTimeout(r,1000));
   }
   await dispose();
   const storage=await storageStatus();results.storageAfterEnvironment=storage;showStorage(storage);save();
   if(results.cleanupError||results.runs.at(-1)?.stagingCleanupError||storage.temporaryDirectories)throw Error('Staging cleanup was incomplete. Stopped to prevent storage growth; close other test tabs and clear temporary staging.');
  }
  if(running){const rows=results.runs.flatMap(r=>r.matrix).filter(r=>Number.isInteger(r.round));const passed=rows.filter(r=>r.status==='kernel_success').length;
   results.finished=new Date().toISOString();results.summary={positiveExecutions:rows.length,passed,environmentErrors:results.runs.filter(r=>r.error).length,diagnosticTimingOnly:timing==='slow',overOriginalBudget:results.runs.flatMap(r=>r.proofs).filter(p=>p.exceededOriginalBudget&&p.name.endsWith('.json')).length};save();status('Finished. '+passed+'/'+rows.length+' positive executions succeeded. '+(timing==='slow'?'Timing diagnostics only; '+results.summary.overOriginalBudget+' exceeded the original budget. ':'')+'Environment errors: '+results.summary.environmentErrors+'. Export results for review.');}
 }catch(error){results.error=String(error);save();status(String(error));}
 finally{await dispose();running=false;$('start').disabled=false;$('cleanup').disabled=false;$('stop').disabled=true;}
}
$('start').onclick=async()=>{try{await withTestLock(runSuite);}catch(error){status(String(error));}};
try{if(await isolate()){$('start').disabled=false;showStorage(await storageStatus());status('Ready. Isolated: yes. '+(results.runs.length?'Previous results are available to export.':''));}}catch(error){status(String(error));}
