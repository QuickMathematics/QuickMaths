import assert from 'node:assert/strict';
import {referenceSource, sourceForExperiment, REFERENCE_ENVIRONMENT} from './compatibility.js';

const source='import Mathlib.Basic.Real.Basic\nimport Mathlib.Tactic.Positivity\n'+
  'import Mathlib.Tactic.Ring\n-- import Mathlib.Basic.Real.Basic\n'+
  'public theorem result : (1 : Nat) = 1 := rfl\n';
const actual=referenceSource(source,REFERENCE_ENVIRONMENT);
assert.equal(actual.source,source.replace(/^import Mathlib.Basic.Real.Basic$/m,
  'import Mathlib.Data.Real.Basic').replace(/^import Mathlib.Tactic.Positivity$/m,
  'import Mathlib.Tactic.Positivity.Basic'));
assert.equal(actual.substitutions.length,2);
assert.equal(actual.assessment_eligible,false);
assert.equal(actual.certificate,null);
for(const key of ['leanCommit','mathlibCommit'])
  assert.throws(()=>referenceSource(source,{...REFERENCE_ENVIRONMENT,[key]:'other'}),/unrecognized/);
assert.deepEqual(referenceSource('theorem t : True := True.intro',REFERENCE_ENVIRONMENT).substitutions,[]);
const matched={leanCommit:'6a10ac8c22beadecabdbb0919c2b50214762f91d',mathlibCommit:'42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c',importPolicy:'production-private-strict',portSha256:'a'.repeat(64)};
assert.equal(sourceForExperiment(source,matched).source,source);
assert.deepEqual(sourceForExperiment(source,matched).substitutions,[]);
assert.equal(sourceForExperiment(source,matched).certificate,null);
assert.throws(()=>sourceForExperiment(source,{...matched,importPolicy:'fallback'}),/Unrecognized/);
assert.throws(()=>sourceForExperiment(source,{...matched,portSha256:''}),/Unrecognized/);
console.log('PASS compatibility changes only two anchored imports at the exact reference pins; never eligible for assessment.');
