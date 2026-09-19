// Fresh browser proof requests; archived evidence still requires replay.
import {browserRpc,dispose} from './formal-runtime/host.js';
const ENV={backend:'lean4',lean_toolchain:'leanprover/lean4:v4.34.0-rc2',library:'mathlib',mathlib_revision:'42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c'};
let idle;
function status(text){for(const el of document.querySelectorAll('[data-formal-runtime-status]'))el.textContent=text||'Proof verification may take up to a minute. Your draft is preserved.';}
export function browserFormalAvailable(){return typeof window!=='undefined'&&typeof location!=='undefined'&&location.protocol!=='file:';}
async function ensure(){
 if(/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1))throw Error('Browser proof checking on iPhone and iPad is not available yet. Your proof stays saved.');
 if(!/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent))throw Error('Browser proof checking currently supports Chrome and Edge on PC, and Chrome on Android.');
 if(!isSecureContext||!navigator.serviceWorker||!navigator.storage?.getDirectory||!navigator.locks)throw Error('This browser lacks the secure storage features needed for proof checking.');
 const scope=new URL('./formal-runtime/',import.meta.url);
 if(!location.pathname.startsWith(scope.pathname)){
  scope.hash=location.hash;setTimeout(()=>location.assign(scope.href),500);
  throw Error('Opening the protected proof workspace. Your saved test will reopen; select Start my proof again there.');
 }
 if(!crossOriginIsolated){
  await navigator.serviceWorker.register(new URL('coi-sw.js',scope),{scope:scope.pathname,updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Proof workspace activation timed out. Please retry.')),10000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});});
  if(sessionStorage.getItem('qm-formal-isolation-reload'))throw Error('Proof workspace isolation could not start. Close this tab and reopen QuickMaths.');
  sessionStorage.setItem('qm-formal-isolation-reload','1');setTimeout(()=>location.reload(),500);
  throw Error('Enabling the protected proof workspace. The page will reload once; your draft is saved.');
 }
 sessionStorage.removeItem('qm-formal-isolation-reload');
}
export async function browserFormalHealth(){await ensure();return {service:'quickmaths-formal',protocol_version:'0.1',lean_available:true,environment:ENV};}
export async function browserFormalRpc(message){
 await ensure();clearTimeout(idle);
 try{return await navigator.locks.request('qm-browser-lean-phone-test',{ifAvailable:true},lock=>{
 if(!lock)throw Error('Another proof-checking tab is active. Finish there first.');
 status('Preparing local proof checking. First download and setup can take longer than a minute.');
 return browserRpc(message,phase=>status(phase==='proof'?'Checking your proof…':'Preparing the verified math environment…'));
 });}finally{status('');idle=setTimeout(()=>void dispose(),60000);}
}

// A base URL shares app assets; hash-only links must stay on this entry.
if(typeof document!=='undefined')document.addEventListener('click',event=>{
 const link=event.target.closest?.('a[href^="#"]');
 if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 if(location.pathname.startsWith(new URL('./formal-runtime/',import.meta.url).pathname)){
  event.preventDefault();location.hash=link.getAttribute('href');
 }
});
