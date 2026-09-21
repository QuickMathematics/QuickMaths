// Real kernel results only. Synthetic author fixtures never touch learner storage.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createQuickMathsStore,STORAGE_KEY} from '../docs/challenge-core.js';
let input='';for await(const c of process.stdin)input+=c;
const {baseUrl}=JSON.parse(input);
const curriculum=JSON.parse(readFileSync(new URL('../docs/curriculum-data.json',import.meta.url),'utf8'));
function fresh(initial=null){
 const mem=new Map(initial?[[STORAGE_KEY,initial]]:[]);
 return createQuickMathsStore({curriculum,storage:{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)},formalOptions:{baseUrl}});
}
for(const sid of ['MATH_CALC_003','MATH_CALC_004','MATH_CALC_005','MATH_CALC_006']){
 let store=fresh();store.createProfile('Synthetic Batch 6 kernel integration');store.completeTutorial({skipped:true});store.setLearningPreferences({progressionMode:'soft'});
 const draft=store.startTest(sid);assert.equal(draft.problems.length,21);
 for(const p of draft.problems)store.updateResponse(p.template_id,{finalAnswer:p.expected_answer,work:'Synthetic submission plumbing; this explanation still requires tutor review.',structuredWorkJson:p.grading_method==='rational_expression'?{excluded_values:p.answer_metadata.excluded_values}:null});
 assert.equal(store.submitTest().ok,false,'Answer keys alone cannot complete a formal assessment');
 const q=draft.problems.find(p=>p.proof_spec),id=q.template_id;
 await store.runFormalProof(id,'start');
 for(const step of q.proof_spec.reference_proof.steps){
  const premises=step.premises.map(id=>id.replace(/^reference_step_/,'user_step_'));
  await store.runFormalProof(id,'append',{...step,premises});
 }
 const checked=await store.runFormalProof(id,'verify');assert.equal(checked.assessment_eligible,true,JSON.stringify(checked));
 if(sid==='MATH_CALC_003'){
  store=fresh(store.exportSyncState());
  assert.equal(store.inspectFormalProof({questionId:id}).assessment_eligible,false,'Restoration cannot preserve live verification authority');
  assert.equal(store.submitTest().ok,false);
  const replay=await store.runFormalProof(id,'replay');assert.equal(replay.assessment_eligible,true,JSON.stringify(replay));
 }
 assert.equal(store.submitTest().ok,true);
 const result=store.saveReflection({confidenceRating:4,guessed:'no'});
 assert.equal(result.percentScore,1);assert.equal(result.hasPendingReview,true);
 assert.equal(store.statusForSkill(sid),'learning','Formal verification cannot substitute for the conceptual capstone review');
 console.log(JSON.stringify({skill:sid,status:'passed',submitted_kernel_verified:true,restore_replay_checked:sid==='MATH_CALC_003',capstone_still_pending:true}));
}
