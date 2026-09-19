// Private development host; not connected to lesson grading.
import {runKernel,releaseKernel} from './kernel.js';
let python,seq=0,queue=Promise.resolve();
function pythonCall(message,replies){
 python??=new Worker(new URL('./python-worker.js',import.meta.url),{type:'module'});
 const id=++seq;return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{python?.terminate();python=null;reject(Error('Proof preparation timed out.'));},60000);
 python.onmessage=({data})=>{if(data.id!==id)return;clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.result);};
 python.onerror=e=>{clearTimeout(timer);python?.terminate();python=null;reject(Error(e.message));};python.postMessage({id,message,replies});
 });
}
async function perform(message,status){
 const replies={};let proofMs=0;
 for(let i=0;i<14;i++){
 const result=await pythonCall(message,replies);
 if(result.done){if(!result.response.ok)throw Error(result.response.error?.message||'Proof request rejected');return result.response.result;}
 if(typeof result.source!=='string'||result.source.length>100000)throw Error('Invalid generated proof');
 const budget=Math.min(result.seconds,60-proofMs/1000);if(budget<=0)throw Error('Proof checking reached the one-minute limit.');
 const proof=await runKernel(result.source,budget,status);proofMs+=proof.elapsed||0;
 const stdout=proof.output.map(line=>{try{return JSON.parse(line).data||'';}catch{return line;}}).join('\n');
 replies[proof.sourceHash]={returncode:proof.experimentalKernelSuccess?0:1,stdout,stderr:proof.error||'',elapsed_ms:Math.round(proof.elapsed||0)};
 }throw Error('Proof checking reached its bounded step limit.');
}
export function browserRpc(message,status=()=>{}){
 if(JSON.stringify(message).length>1000000)throw Error('Proof request too large');
 const task=queue.then(()=>perform(message,status));queue=task.catch(()=>{});return task;
}
export async function dispose(){await queue;python?.terminate();python=null;await releaseKernel();}
