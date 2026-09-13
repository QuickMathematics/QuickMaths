const $=id=>document.getElementById(id);
const key='qm-browser-lean-phone-results-v1';
let running=false,frame,results;
try{results=JSON.parse(localStorage.getItem(key))||{runs:[]};}catch{results={runs:[]};}
const save=()=>{try{localStorage.setItem(key,JSON.stringify(results));}catch{}};
const status=text=>{$('status').textContent=text;};
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
function dispose(){try{frame?.contentWindow.stopProbe?.();}catch{}frame?.remove();frame=null;}
$('stop').onclick=()=>{running=false;dispose();results.interrupted=true;save();status('Stopped. Partial results can be exported.');};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(results,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='quickmaths-phone-lean-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
$('start').onclick=async()=>{
 if(running)return;running=true;$('start').disabled=true;$('stop').disabled=false;
 results={started:new Date().toISOString(),userAgent:navigator.userAgent,isolated:crossOriginIsolated,deviceMemoryGiB:navigator.deviceMemory??null,assessment_eligible:false,certificate:null,runs:[]};save();
 try{
  status('Verifying deployment identity…');results.pins=await checkPins();save();
  const groups=$('group').value==='all'?[...$('group').options].map(o=>o.value).filter(v=>v!=='all'):[$('group').value];
  for(const group of groups){
   if(!running)break;dispose();frame=document.createElement('iframe');
   frame.src='runner.html?'+new URLSearchParams({group,mode:'modules',rounds:'3',memoryProfile:'1',releaseStaged:'all'});
   $('frame').append(frame);
   await new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(Error('Runner failed to load'));});
   while(running&&!frame.contentWindow.startProbe)await new Promise(r=>setTimeout(r,100));
   if(!running)break;
   frame.contentWindow.startProbe();
   while(running){
    const report=frame.contentWindow.report;
    results.active={group,stage:report.stages.at(-1),proof:report.activeProof,importProgress:report.importProgress,at:new Date().toISOString()};save();
    status(JSON.stringify(results.active,null,2));
    if(report.done){results.runs.push(JSON.parse(JSON.stringify(report)));delete results.active;save();break;}
    await new Promise(r=>setTimeout(r,1000));
   }
   dispose();
  }
  if(running){const rows=results.runs.flatMap(r=>r.matrix).filter(r=>Number.isInteger(r.round));const passed=rows.filter(r=>r.status==='kernel_success').length;
   results.finished=new Date().toISOString();results.summary={positiveExecutions:rows.length,passed,environmentErrors:results.runs.filter(r=>r.error).length};save();status('Finished. '+passed+'/'+rows.length+' positive executions succeeded. Environment errors: '+results.summary.environmentErrors+'. Export results for review.');}
 }catch(error){results.error=String(error);save();status(String(error));}
 finally{dispose();running=false;$('start').disabled=false;$('stop').disabled=true;}
};
try{if(await isolate()){$('start').disabled=false;status('Ready. Isolated: yes. '+(results.runs.length?'Previous results are available to export.':''));}}catch(error){status(String(error));}
