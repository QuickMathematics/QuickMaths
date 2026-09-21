/** Native compatibility regressions. All workspaces are synthetic and in-memory.
 * These are application tests, not Lean kernel verification results. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createQuickMathsStore, gradeProblem, normalizeFormalJob, normalizeFormalProofSpec,
  resolveNativeProofSpec, validateProceduralWork, STORAGE_KEY,
} from './challenge-core.js';
import {formalProblemBinding, canonicalFormalJson, sha256Hex} from './formal-binding.js';
const curriculum = JSON.parse(readFileSync(new URL('./curriculum-data.json', import.meta.url)));
const legacy = JSON.parse(readFileSync(new URL('./test-support/native-drafts-v17.json', import.meta.url)));
const formalSkills = curriculum.skills.filter(s => s.native_templates?.some(t => t.proof_spec));
function storage(initial = null) {
  const data = new Map(initial ? [[STORAGE_KEY, typeof initial === 'string' ? initial : JSON.stringify(initial)]] : []);
  return {getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v))};
}
function storeFor(data = curriculum, initial = null) {
  return createQuickMathsStore({curriculum:data, storage:storage(initial), now:()=>new Date('2026-09-21T12:00:00Z')});
}
function fresh(data = curriculum, attempt = 0, id = 'MATH_POLY_002') {
  let store = storeFor(data); const profile = store.createProfile('Synthetic compatibility learner');
  store.completeTutorial({skipped:true});
  if (attempt) {
    const state = JSON.parse(store.exportSyncState());
    state.progress[profile.id][id] = {attemptCount:attempt};
    store = storeFor(data,state);
  }
  return store;
}
function formalData() {
  const data = structuredClone(curriculum), skill = data.skills.find(s=>s.id==='MATH_POLY_002');
  const template = structuredClone(skill.native_templates.find(t=>t.proof_spec));
  template.id='MATH_POLY_002_FORMAL_UINT32_TEST';
  template.type='generated'; template.variables={a:{type:'int',min:-4,max:4}};
  template.prompt_template='For a={a}, prove (x+{a})*(x+3)=x^2+({a}+3)*x+3*{a} for real x.';
  template.proof_spec.statement.goal='(x+{a})*(x+3)=x^2+({a}+3)*x+3*{a}';
  template.proof_spec.reference_proof.steps[0].claim=template.proof_spec.statement.goal;
  template.proof_spec.parameter_contract={required_public:['a']};
  skill.native_templates=[template];skill.question_count=1;
  return {data,skill,template};
}
function assertBound(p) {
  assert.equal(p.formal_job.problem_binding_sha256,formalProblemBinding(p));
  assert.doesNotThrow(()=>normalizeFormalJob(p.formal_job,p.proof_spec,p.template_id,formalProblemBinding(p)));
  assert.equal(gradeProblem(p,String(p.expected_answer)).correct,false);
}
function mathematicalQuestion(p) {const {formal_job,...math}=p;return math;}

test('rotated retakes survive reload, backup and sync with exact snapshots and responses',()=>{
  assert.equal(formalSkills.length,8);
  for(const skill of formalSkills) for(const attempt of [1,2,7]) {
    const store=fresh(curriculum,attempt,skill.id),draft=store.startTest(skill.id,{force:true});
    for(const p of draft.problems)store.updateResponse(p.template_id,{finalAnswer:'saved answer',work:'saved reasoning',structuredWorkJson:{note:'saved structure'}});
    const before=store.snapshot().activeTest;
    const restored=storeFor(curriculum,store.exportSyncState());
    assert.deepEqual(restored.snapshot().activeTest,before,skill.id);
    const imported=storeFor();imported.importBackup(store.exportBackup());imported.selectProfile(imported.snapshot().profiles[0].id);imported.navigate('test',skill.id);
    assert.deepEqual(imported.snapshot().activeTest,before,`${skill.id}: backup`);
    const synced=storeFor();synced.importSyncState(store.exportSyncState());
    assert.deepEqual(synced.snapshot().activeTest,before,`${skill.id}: sync`);
  }
});

test('v17 pre-rotation migration preserves all original questions and proof steps, repairing only legacy bindings',()=>{
  const restored=storeFor(curriculum,legacy.state),after=JSON.parse(restored.exportSyncState());
  let questions=0,proofs=0;
  for(const [profileId,drafts] of Object.entries(legacy.state.drafts)) for(const [id,before] of Object.entries(drafts)){
    const saved=after.drafts[profileId][id];assert.ok(saved);assert.equal(saved.recoveryProblems,undefined);
    assert.deepEqual(saved.problems.map(mathematicalQuestion),before.problems.map(mathematicalQuestion),id);
    assert.equal(saved.snapshot_version,1);questions+=saved.problems.length;
    for(const p of before.problems){
      const a=saved.responses[p.template_id],b=before.responses[p.template_id];
      assert.equal(a.finalAnswer,b.finalAnswer);assert.equal(a.work,b.work);
      if(!p.proof_spec){assert.deepEqual(a.structuredWorkJson,b.structuredWorkJson);continue;}
      proofs++;const current=saved.problems.find(q=>q.template_id===p.template_id);assertBound(current);
      const f=a.structuredWorkJson.formal,old=b.structuredWorkJson.formal;
      assert.deepEqual({...f.request,request_id:old.request.request_id},old.request);
      assert.deepEqual(f.pending_edit,old.pending_edit);
      assert.equal(f.verification,null);assert.equal(f.binding_migration.requires_fresh_verification,true);
      assert.equal(f.problem_binding_sha256,current.formal_job.problem_binding_sha256);
      assert.equal(f.request.request_id,current.formal_job.rpc.request_id);
      restored.navigate('test',id);
      assert.equal(restored.getFormalWorkspace(p.template_id).assessmentEligible,false);
    }
  }
  assert.equal(proofs,8);assert.ok(questions>80);
  assert.deepEqual(after.formalEvidence,legacy.state.formalEvidence);
  assert.deepEqual(storeFor(curriculum,after).snapshot().activeTest,restored.snapshot().activeTest);
});

test('new draws are independent of template order, and older saved content does not follow template edits',()=>{
  const a=structuredClone(curriculum),b=structuredClone(curriculum);
  const sa=a.skills.find(s=>s.id==='MATH_ALG_002'),sb=b.skills.find(s=>s.id===sa.id);
  sb.native_templates.reverse();
  const first=storeFor(a).previewNativeAssessment(sa.id,3).problems,second=storeFor(b).previewNativeAssessment(sa.id,3).problems;
  for(const p of first)assert.deepEqual(second.find(q=>q.source_template_id===p.source_template_id),p);
  const store=fresh(a);store.startTest(sa.id,{force:true});const before=store.snapshot().activeTest;
  for(const t of sb.native_templates)t.prompt_template='Changed source defaults must not reinterpret an existing answer.';
  assert.deepEqual(storeFor(b,store.exportSyncState()).snapshot().activeTest,before);
});

test('native fixed formal questions bind their final runtime identity and survive mathematical displays',()=>{
  for(const skill of formalSkills){const p=storeFor().previewNativeAssessment(skill.id,1).problems.find(q=>q.proof_spec);assertBound(p);}
  const data=structuredClone(curriculum),skill=data.skills.find(s=>s.id==='MATH_POLY_002');
  const p=skill.problems.find(p=>p.proof_spec);
  p.math_blocks=[{type:'notation',text:'(x+2)*(x+3)=x^2+5*x+6',alt:'The identity to prove.',linear_text:'(x+2)*(x+3)=x^2+5*x+6'}];
  p.diagram={kind:'cartesian',x_range:[-3,3],y_range:[-5,20],alt:'The stated polynomial.',curves:[{expression:'(x+2)*(x+3)',interval:[-3,3]}]};
  skill.problems=[p];skill.native_templates=[skill.native_templates.find(t=>t.proof_spec)];skill.question_count=1;
  const store=fresh(data);const before=store.startTest(skill.id,{force:true});
  assertBound(before.problems[0]);assert.deepEqual(storeFor(data,store.exportSyncState()).snapshot().activeTest,before);
});

test('100 generated formal variations retain public statements and bound jobs and never use the answer-string grader',()=>{
  const {data,skill}=formalData(),store=storeFor(data);const values=new Set();let largeSeed=false;
  for(let i=0;i<100;i++){
    const p=store.previewNativeAssessment(skill.id,i).problems[0];assertBound(p);
    assert.doesNotMatch(p.proof_spec.statement.goal,/\{a\}/);assert.match(p.prompt,new RegExp(`a=${p.values.a}`));
    assert.deepEqual(p.proof_spec.parameter_contract,{required_public:['a']});
    values.add(p.values.a);if(p.seed>2_000_000_000)largeSeed=true;
  }
  assert.ok(values.size>=8);assert.ok(largeSeed);
  const store2=fresh(data);const before=store2.startTest(skill.id,{force:true});
  assert.deepEqual(storeFor(data,store2.exportSyncState()).snapshot().activeTest,before);
});

for(const mode of ['required-hidden','expression-hidden','invalid-spec','invalid-generation'])test(`formal generation fails closed without bank fallback: ${mode}`,()=>{
  const {data,skill,template}=formalData();template.derived={secret:'999'};
  if(mode==='required-hidden')template.proof_spec.parameter_contract.required_public.push('secret');
  if(mode==='expression-hidden')template.proof_spec.statement.goal='x+{a+secret}=x+{a+secret}';
  if(mode==='invalid-spec')template.proof_spec.lean_source='unsafe';
  if(mode==='invalid-generation')template.variables.a={type:'unsupported'};
  assert.throws(()=>storeFor(data).previewNativeAssessment(skill.id,0));
});

test('formal parameter resolution preserves the required method and uses only public arithmetic',()=>{
  const base=normalizeFormalProofSpec({version:'0.1',statement:{declarations:['x:real'],assumptions:[],goal:'x+{a+1}=x+{a+1}'},parameter_contract:{required_public:['a']},allowed_rules:['eq_refl'],assessment_policy:{required_method:'implication'}});
  const resolved=resolveNativeProofSpec(base,{a:2});assert.equal(resolved.statement.goal,'x+3=x+3');
  assert.deepEqual(resolved.assessment_policy,base.assessment_policy);
  assert.throws(()=>resolveNativeProofSpec(base,{}));
});

test('corrupt snapshots retain recoverable text and responses but cannot create a result',()=>{
  const store=fresh();store.startTest('MATH_ALG_002',{force:true});const state=JSON.parse(store.exportSyncState()),id=state.activeProfileId;
  const draft=state.drafts[id].MATH_ALG_002,p=draft.problems[0];
  draft.responses[p.template_id].work='This work must remain recoverable.';p.expected_answer='tampered';
  const restored=storeFor(curriculum,state);const view=restored.snapshot();
  assert.ok(view.activeTest.recoveryProblems.length);assert.match(view.activeTest.recoveryProblems[0].serialized,/This work must remain recoverable/);
  assert.equal(restored.submitTest().recoveryRequired,true);assert.equal(restored.snapshot().attempts.length,0);
  const reloaded=storeFor(curriculum,restored.exportSyncState());assert.deepEqual(reloaded.snapshot().activeTest,view.activeTest);
  assert.equal(reloaded.submitTest().ok,false);
});

test('legacy binding repair refuses changed theorems, preserving their inert work rather than silently grading',()=>{
  const state=structuredClone(legacy.state),profile=state.activeProfileId,id='MATH_POLY_002';state.ui.selectedSkillId=id;state.ui.route='test';
  const draft=state.drafts[profile][id],p=draft.problems.find(p=>p.proof_spec);p.proof_spec.statement.goal='x=x+1';
  const restored=storeFor(curriculum,state),saved=restored.snapshot().activeTest;
  assert.equal(saved.recoveryProblems.length,1);assert.match(saved.recoveryProblems[0].serialized,/user_step_1/);
  assert.equal(restored.submitTest().ok,false);
});

test('follow-up ordering updates the snapshot checksum and remains stable after restoration',()=>{
  const store=fresh();const d=store.startTest('MATH_ARITH_001',{force:true});
  store.createFollowupProblem({skillId:'MATH_ARITH_001',focus:d.problems.at(-1).mistake_tags[0]});
  const before=store.snapshot().activeTest;
  assert.equal(before.snapshot_sha256,sha256Hex(canonicalFormalJson(before.problems)));
  assert.deepEqual(storeFor(curriculum,store.exportSyncState()).snapshot().activeTest,before);
});

const expr=(expected,answer)=>gradeProblem({expected_answer:expected,grading_method:'symbolic_expression',answer_type:'expression',variable:'x'},answer).correct;
for(const [expected,wrong] of [
 ['-2*abs(x+3)+1','1-2*abs(x)-2*abs(3)'],['sin(2*x)','2*sin(x)'],['cos(2*x)','2*cos(x)'],
 ['log(2*x)','2*log(x)'],['exp(2*x)','2*exp(x)'],['log(x^2)','2*log(x)'],['sqrt(x^2)','x'],
 ['sin(pi*x)','0'],['x','exp(log(x))'],['cos(x)','1'],
])test(`function expression rejects false identity: ${expected} = ${wrong}`,()=>assert.equal(expr(expected,wrong),false));
for(const [expected,right] of [
 ['-2*abs(x+3)+1','1-2*abs(3+x)'],['sqrt(x^2)','abs(x)'],['sin(x)^2+cos(x)^2','1'],
 ['exp(2*x)','exp(x)^2'],['log(x)','ln(x)'],['log(x-100)','ln(x-100)'],['sqrt(0.01-x^2)','sqrt(0.01-x*x)'],
 ['pi*(x+1)','pi(x+1)'],['log(exp(x))','x'],
])test(`function expression accepts supported equivalence: ${expected}`,()=>assert.equal(expr(expected,right),true));
for(const name of ['tan','foo','fetch','eval','sin1'])test(`unknown function calls are rejected, never split into letter products: ${name}`,()=>assert.equal(expr(`${name}(2*x)`,`2*${name}(x)`),false));

// Independent denominator oracles: these values come from each original
// equation family, not from the new browser work-contract implementation.
const rationalRestrictions = {
 RAT_EQ_RECIPROCAL_SHIFT_001:v=>[v.a], RAT_EQ_LINEAR_DENOMINATOR_CONSTANT_001:v=>[v.a],
 RAT_EQ_OUTSIDE_CONSTANT_001:v=>[v.a], RAT_EQ_COMBINE_SAME_DENOMINATOR_001:v=>[v.a],
 RAT_EQ_CROSS_MULTIPLY_SHIFTED_001:v=>[v.b,v.d], RAT_EQ_CROSS_MULTIPLY_X_AND_SHIFT_001:v=>[0,-v.shift],
 RAT_EQ_VARIABLE_NUMERATOR_001:v=>[v.a], RAT_EQ_NONZERO_NUMERATOR_EQUALS_ZERO_001:v=>[v.a],
 RAT_EQ_UNEQUAL_NUMERATORS_SAME_DENOM_001:v=>[v.a], RAT_EQ_EQUAL_WORK_RATES_001:()=>[0],
 RAT_EXTRA_CANCELED_FACTOR_ONE_VALID_001:v=>[0,v.a], RAT_EXTRA_ZERO_NUMERATOR_ONE_VALID_001:v=>[v.a,v.c],
 RAT_EXTRA_DIFFERENCE_SQUARES_EMPTY_001:v=>[v.a], RAT_EXTRA_DIFFERENCE_SQUARES_VALID_001:v=>[v.a],
 RAT_EXTRA_TWO_VALID_ROOTS_001:v=>[v.sum_roots], RAT_EXTRA_REPEATED_VALID_ROOT_001:v=>[v.twice_r],
 RAT_EXTRA_BOTH_CANDIDATES_EXCLUDED_001:v=>[v.a,v.b], RAT_EXTRA_SYMMETRIC_ROOTS_001:()=>[0],
 RAT_EXTRA_NO_REAL_ROOTS_001:()=>[0], RAT_EXTRA_LINEAR_EXCLUDED_CANDIDATE_001:v=>[v.a],
};
test('rational work contracts retain original restrictions across 2,000 native questions, including cancelled holes',()=>{
 const store=storeFor();let checked=0;
 for(const id of ['MATH_RAT_004','MATH_RAT_005'])for(let variation=0;variation<100;variation++){
  for(const p of store.previewNativeAssessment(id,variation).problems){
   assert.match(p.template_id,/__RUNTIME_/);checked++;
   const v=Object.fromEntries(Object.entries(p.values).map(([k,x])=>[k,Number(x)]));
   assert.deepEqual(new Set(p.work.expected_restrictions.map(Number)),new Set(rationalRestrictions[p.source_template_id](v)),p.source_template_id);
   assert.equal(p.work.original_equation.split('=').length,2);
   assert.doesNotMatch(p.work.original_equation,/machines|satisfies|Solve/);
   assert.match(validateProceduralWork(p,'',{restrictions:['99999']}),/restriction set/);
  }
 }
 assert.equal(checked,2000);
});
test('legacy compact rational working restores unchanged and checks exclusions from the saved equation',()=>{
 const store=fresh();store.startTest('MATH_RAT_004',{force:true});const state=JSON.parse(store.exportSyncState()),d=state.drafts[state.activeProfileId].MATH_RAT_004;
 state.version=17;delete d.snapshot_version;delete d.snapshot_sha256;delete d.assessment_variation;
 for(const p of d.problems){delete p.work.expected_restrictions;delete p.work.original_equation;d.responses[p.template_id].work='Saved denominator-clearing reasoning';}
 const old=structuredClone(d),restored=storeFor(curriculum,state),after=restored.snapshot().activeTest;
 assert.deepEqual(after.problems,old.problems);assert.deepEqual(after.responses,old.responses);assert.equal(after.recoveryProblems,undefined);
 const story=after.problems.find(p=>p.source_template_id==='RAT_EQ_EQUAL_WORK_RATES_001');
 assert.match(validateProceduralWork(story,'',{restrictions:['99999']}),/restriction set/);
 assert.match(validateProceduralWork(story,'',{restrictions:['0']}),/step/);
});

test('snapshot recovery also blocks a previously pending reflection from recording mastery',()=>{
 const store=fresh();const draft=store.startTest('MATH_ARITH_001',{force:true});
 for(const p of draft.problems)store.updateResponse(p.template_id,{finalAnswer:String(p.expected_answer),work:'Synthetic ordinary working'});
 assert.equal(store.submitTest().ok,true);
 const saved=JSON.parse(store.exportSyncState()),d=saved.drafts[saved.activeProfileId].MATH_ARITH_001;
 d.problems[0].prompt='Corrupted saved givens';
 const restored=storeFor(curriculum,saved),before=restored.snapshot().progress;
 assert.throws(()=>restored.saveReflection({confidenceRating:5,guessed:'no'}),/Recover the saved question/);
 assert.deepEqual(restored.snapshot().progress,before);assert.equal(restored.snapshot().attempts.length,0);
});

for(const mutation of ['missing-spec','different-theorem'])test(`fixed formal bank cannot silently change the displayed theorem: ${mutation}`,()=>{
 const data=structuredClone(curriculum),skill=data.skills.find(s=>s.id==='MATH_POLY_002');
 const t=skill.native_templates.find(t=>t.proof_spec),p=skill.problems.find(p=>p.proof_spec);
 skill.native_templates=[t];skill.problems=[p];skill.question_count=1;
 if(mutation==='missing-spec'){delete p.proof_spec;delete p.formal_job;}else t.proof_spec.statement.goal='x=x';
 assert.throws(()=>storeFor(data).previewNativeAssessment(skill.id,0),/formal|binding|theorem/i);
});

test('every shipped native lesson preserves its complete question snapshot and ordinary work on reload',()=>{
 for(const skill of curriculum.skills){
  const store=fresh();const d=store.startTest(skill.id,{force:true});
  for(const p of d.problems)store.updateResponse(p.template_id,{finalAnswer:p.proof_spec?'':'Synthetic answer',work:'Synthetic saved working'});
  const before=store.snapshot().activeTest;
  assert.deepEqual(storeFor(curriculum,store.exportSyncState()).snapshot().activeTest,before,skill.id);
 }
});
