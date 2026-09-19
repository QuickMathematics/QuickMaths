import pins from './pins.js';
import {loadPyodide} from '../vendor/pyodide-0.28.3/pyodide-esm.js';
const nativeFetch=fetch.bind(globalThis);
const digest=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
globalThis.fetch=async(url,options)=>{
 const absolute=new URL(typeof url==='string'?url:(url.href||url.url),import.meta.url);
 if(absolute.origin!==location.origin)throw Error('External verifier dependency blocked');
 const name=absolute.pathname.split('/').pop(),spec=pins['python/'+name]||pins[name];
 if(!spec)throw Error('Unpinned verifier dependency: '+name);
 const response=await nativeFetch(absolute,options);if(!response.ok)throw Error('Verifier dependency unavailable: '+name);
 const bytes=await response.arrayBuffer();if(bytes.byteLength!==spec.bytes||await digest(bytes)!==spec.sha256)throw Error('Verifier dependency integrity failure');
 return new Response(bytes,{headers:response.headers,status:response.status});
};
let runtime;
async function ready(){
 if(!runtime)runtime=(async()=>{
 const py=await loadPyodide({indexURL:new URL('../vendor/pyodide-0.28.3/',import.meta.url).href});
 await py.loadPackage(['mpmath']);
 const sympy=await (await fetch(new URL('./sympy-1.14.0-py3-none-any.whl',import.meta.url).href)).arrayBuffer();
 py.unpackArchive(new Uint8Array(sympy),'zip',{extractDir:'/home/pyodide'});
 const archive=await (await fetch(new URL('./native-verifier.zip',import.meta.url).href)).arrayBuffer();
 py.unpackArchive(new Uint8Array(archive),'zip',{extractDir:'/home/pyodide'});
 py.runPython('from quickmaths_formal.browser_host import browser_rpc');return py;
 })();return runtime;
}
onmessage=async({data})=>{
 try {const py=await ready();
 py.globals.set('_qm_message',JSON.stringify(data.message));py.globals.set('_qm_replies',JSON.stringify(data.replies));
 let result;try{result=JSON.parse(py.runPython('browser_rpc(_qm_message, _qm_replies)'));}finally{py.globals.delete('_qm_message');py.globals.delete('_qm_replies');}
 postMessage({id:data.id,result});
 }catch(e){postMessage({id:data.id,error:String(e)});}
};
