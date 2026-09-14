import test from 'node:test';
import assert from 'node:assert/strict';
import {timingBudget,slowCases} from './timing-policy.js';
test('standard mode preserves the original budget',()=>assert.equal(timingBudget('standard',10000),10000));
test('slow timing is bounded and selects exactly twelve known cases',()=>{assert.equal(timingBudget('slow',10000),60000);assert.equal(slowCases.size,12);assert.ok([...slowCases].every(n=>n.startsWith('series_')&&n.endsWith('.json')));});
test('unknown timing modes and invalid budgets fail closed',()=>{for(const mode of ['unlimited','',null])assert.throws(()=>timingBudget(mode,10000));for(const budget of [0,-1,NaN,Infinity])assert.throws(()=>timingBudget('slow',budget));});
