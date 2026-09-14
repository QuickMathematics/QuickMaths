import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./opfs-module-worker.js',import.meta.url),'utf8');
function harness({shortWrite=false,shortRead=false}={}){
 let listener,stored;const nodes=new Map(),messages=[],reads=[];
 const handle={close(){messages.push({closed:true});},truncate(){},flush(){},write(bytes){stored=bytes.slice();return bytes.length-(shortWrite?1:0);},read(buffer,{at}){reads.push(buffer.length);const data=stored.subarray(at,at+buffer.length);buffer.set(data);return data.length-(shortRead?1:0);}};
 const directory={async removeEntry(){assert.equal(messages.at(-1).closed,true);messages.push({removed:true});},async getDirectoryHandle(){return directory;},async getFileHandle(){return {async createSyncAccessHandle(){return handle;}};}};
 const memory=new ArrayBuffer(200000);
 const self={addEventListener(type,fn){listener=fn;},postMessage(msg){messages.push(msg);},probeMemory:{buffer:memory},mmapAlloc(){return 65536;}};
 const FS={writeFile(path){nodes.set(path,{stream_ops:{},usedBytes:0});},lookupPath(path){return {node:nodes.get(path)};},ErrnoError:class extends Error{constructor(n){super(String(n));}}};
 vm.runInNewContext(source,{self,Module:{FS},compileBusy:false,navigator:{storage:{async getDirectory(){return directory;}}},Uint8Array,Number,Error,mkdirp(){}});
 const raw=Uint8Array.from({length:90000},(_,i)=>i%251);
 const request={type:'stage_pack',session:'12345678-1234-1234-1234-123456789abc',pack:'a'.repeat(64),raw:raw.buffer,entries:[{path:'Mathlib/Test.olean',offset:17,bytes:70001}]};
 return {run:msg=>listener({data:msg||request}),request,raw,nodes,messages,reads,memory};
}
test('disk reads and mappings preserve exact offsets with bounded scratch memory',async()=>{
 const h=harness();await h.run();assert.equal(h.messages.at(-1).type,'pack_staged');
 const node=h.nodes.get('/lib/lean/Mathlib/Test.olean');assert.equal(node.contents,null);
 const out=new Uint8Array(70001);assert.equal(node.stream_ops.read({},out,0,out.length,0),70001);
 assert.deepEqual(out,h.raw.subarray(17,70018));assert.ok(Math.max(...h.reads)<=65536);
 const map=node.stream_ops.mmap({},70001,0,1,2);assert.equal(map.allocated,true);
 assert.deepEqual(new Uint8Array(h.memory,map.ptr,70001),out);
 assert.equal(node.stream_ops.read({},out,0,10,70001),0);
 assert.throws(()=>node.stream_ops.write(),/63/);
});
test('path traversal fails before staging a module',async()=>{const h=harness();h.request.entries[0].path='../escape';await h.run();assert.equal(h.messages.at(-1).type,'error');assert.equal(h.nodes.size,0);});
test('incomplete disk writes fail closed',async()=>{const h=harness({shortWrite:true});await h.run();assert.equal(h.messages.at(-1).type,'error');assert.equal(h.nodes.size,0);});
test('incomplete disk reads fail rather than returning truncated proof artifacts',async()=>{const h=harness({shortRead:true});await h.run();const node=h.nodes.get('/lib/lean/Mathlib/Test.olean');assert.throws(()=>node.stream_ops.read({},new Uint8Array(10),0,10,0),/29/);});
test('staging handles close before directory removal and completion acknowledgement',async()=>{const h=harness();await h.run();await h.run({type:'close_staging'});assert.equal(h.messages.at(-1).type,'staging_closed');assert.equal(h.messages.at(-1).closedHandles,1);assert.equal(h.messages.at(-1).temporaryFilesRemoved,true);});
