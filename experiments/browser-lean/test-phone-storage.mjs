import test from 'node:test';
import assert from 'node:assert/strict';
import {withTestLock,clearTemporaryStaging,storageStatus} from '../../docs/experiments/browser-lean/phone-storage.js';
function fake({locked=false,removalError=false}={}){
 const removed=[];let exists=true;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(name,opts,fn)=>{assert.equal(name,'qm-browser-lean-phone-test');assert.equal(opts.ifAvailable,true);return fn(locked?null:{});}},storage:{estimate:async()=>({usage:exists?30000000000:335580160}),getDirectory:async()=>({removeEntry:async(name,opts)=>{removed.push(name);assert.equal(opts.recursive,true);if(removalError)throw Error('locked');exists=false;},getDirectoryHandle:async()=>{if(!exists){const e=new Error();e.name='NotFoundError';throw e;}return {async *keys(){yield 'session-one';yield 'session-two';}};}})}}});
 return removed;
}
test('cleanup targets only experiment staging, keeping cache and workspace',async()=>{const removed=fake();assert.equal((await storageStatus()).temporaryDirectories,2);const status=await withTestLock(clearTemporaryStaging);assert.deepEqual(removed,['qm-lean-experimental-staging']);assert.equal(status.temporaryDirectories,0);assert.equal(status.usage,335580160);});
test('another active tab prevents cleanup or starting a test',async()=>{const removed=fake({locked:true});await assert.rejects(withTestLock(clearTemporaryStaging),/Another experimental/);assert.equal(removed.length,0);});
test('locked staging fails visibly rather than continuing to create copies',async()=>{fake({removalError:true});await assert.rejects(clearTemporaryStaging(),/still locked/);});
test('missing storage APIs give a compatibility explanation before any work',async()=>{Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});await assert.rejects(storageStatus(),/storage APIs required/);await assert.rejects(clearTemporaryStaging(),/storage APIs required/);});
