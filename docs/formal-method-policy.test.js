import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFormalMethod,FORMAL_METHODS} from './formal-method-policy.js';
const goal={kind:'proposition',proposition:{kind:'true'}};
for(const [method,{rule}] of Object.entries(FORMAL_METHODS))test(`method ${method} requires the actual terminal goal rule`,()=>{
 const policy={required_method:method};
 const request={goal,steps:[{id:'s1',scope:'root',rule,claim:goal}]};
 assert.doesNotThrow(()=>assertFormalMethod(policy,request));
 assert.throws(()=>assertFormalMethod(policy,{...request,steps:[...request.steps,{id:'s2',scope:'root',rule:'exact',claim:goal}]}),/final goal/);
 assert.throws(()=>assertFormalMethod(policy,{...request,steps:[{...request.steps[0],scope:'child'}]}),/final goal/);
 assert.throws(()=>assertFormalMethod(policy,{...request,steps:[{...request.steps[0],claim:{kind:'other'}}]}),/final goal/);
});
test('unknown policies remain fail closed',()=>{
 for(const policy of [{required_method:'derivative_definition'},{required_method:'induction',ignore:true},{required_method:'__proto__'}])assert.throws(()=>assertFormalMethod(policy,{goal,steps:[]}),/not supported/);
 assert.doesNotThrow(()=>assertFormalMethod({},null));
});
