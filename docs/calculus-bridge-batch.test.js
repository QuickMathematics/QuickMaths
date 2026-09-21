import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createQuickMathsStore,gradeProblem,validateProceduralWork,STORAGE_KEY} from './challenge-core.js';
import {loadLessonAsset} from './lesson-media.js';
import {learningFields,standardBranches} from './learning-fields.js';

const curriculum=JSON.parse(readFileSync(new URL('./curriculum-data.json',import.meta.url),'utf8'));
const ids=['MATH_FUNC_006','MATH_FUNC_007','MATH_CALC_001','MATH_CALC_002'];
const additions=curriculum.skills.filter(s=>ids.includes(s.id));
const makeStore=(data=curriculum,saved=null)=>createQuickMathsStore({curriculum:data,now:()=>new Date('2026-09-09T14:00:00Z'),storage:{getItem:k=>k===STORAGE_KEY?saved:null,setItem(){}}});
const key=p=>p.source_template_id.replace(/^BRIDGE_/,'');
const vals=p=>Object.fromEntries(Object.entries(p.values).map(([k,v])=>[k,Number(v)]));
const except=a=>`(-inf, ${a}) U (${a}, inf)`;
// These oracles recompute the mathematical results from original independent
// variables. They never read derived answers, expected_answer, or solution_steps.
const formulas={
 PW_LEFT:v=>v.m*(v.h-v.d)+v.b, PW_BOUNDARY:v=>2*v.h+v.b, PW_RIGHT:v=>v.d*v.d+v.c,
 PW_THREE:()=>3, PW_GAP:v=>`(-inf, ${v.a}) U [${v.a+v.gap}, inf)`,
 PW_ENDPOINTS:()=> '[0,2) U (2,4]', PW_ABSOLUTE:v=>v.d,
 PW_SOLUTIONS:v=>`{${v.s}, ${-v.r}}`, PW_FILTER:()=>'{1,-2}',
 PW_MATCH:v=>v.m*v.h+v.b-v.h, PW_RANGE_GRAPH:()=> '[0,2) U [3,3]', PW_VALUE_GRAPH:()=>3,
 PW_TARIFF:v=>v.k*v.r+v.d*v.q, PW_PROOF:()=>'{1,-2}',
 RATE_LINEAR:v=>v.m, RATE_QUADRATIC:v=>v.p*(2*v.a+v.gap)+v.q,
 RATE_CUBIC:v=>v.a*v.a, RATE_TABLE:()=>-1, RATE_POSITION:v=>2*v.a+v.gap,
 RATE_TEMPERATURE:v=>v.v,
 RATE_SECANT_LINE:v=>`(${2*v.a+v.gap})*(x-(${v.a}))+(${v.a*v.a})`,
 RATE_DQ_LINEAR:v=>v.m,
 RATE_DQ_QUADRATIC:v=>`${v.p}*(2*x+h)+(${v.q})`,
 RATE_DQ_AT_A:v=>`${v.p}*(2*(${v.a})+h)+(${v.q})`,
 RATE_DQ_CUBIC:()=>'(x+h)^2+x*(x+h)+x^2',
 RATE_DQ_RECIPROCAL:v=>`(-1/${v.a})/(${v.a}+h)`,
 RATE_DQ_DOMAIN:v=>`(-inf,${-v.a}) U (${-v.a},0) U (0,inf)`,
 RATE_SPEED:()=>2, RATE_GRAPH:()=>1, RATE_PROOF:()=> 'h+2*x',
 LIM_POLYNOMIAL:v=>v.p*v.a*v.a+v.b,
 LIM_RATIONAL:v=>`(${v.a+v.c})/(${v.a+v.d})`,
 LIM_FACTOR:v=>2*v.a, LIM_LOCAL_PRODUCT:v=>v.m*v.a+v.b,
 LIM_DQ:v=>2*v.a, LIM_CONJUGATE:v=>`1/${2*v.r}`,
 LIM_LEFT:v=>v.m*v.a+v.b, LIM_RIGHT:v=>v.m*v.a+v.b,
 LIM_MATCHED:v=>2*v.a, LIM_JUMP:()=> 'DNE', LIM_GRAPH:()=>2,
 LIM_INFINITE_RIGHT:()=>'+inf', LIM_INFINITE_LEFT:()=>'-inf',
 LIM_INFINITE_SQUARE:()=>'+inf', LIM_OPPOSITE_INFINITY:()=> 'DNE',
 LIM_ENDPOINT:()=>0, LIM_PROOF:()=>6,
 CONT_VALUE:v=>v.a*v.a+v.b, CONT_FILL:v=>2*v.a,
 CONT_LINEAR_JOIN:v=>v.m*v.h+v.b-v.h, CONT_PRODUCT_JOIN:v=>v.h,
 CONT_RATIONAL_DOMAIN:v=>`(-inf,${v.a}) U (${v.a},${v.a+v.gap}) U (${v.a+v.gap},inf)`,
 CONT_ROOT_DOMAIN:v=>`[${v.h},inf)`, CONT_CANCELLED_DOMAIN:v=>except(v.a),
 CONT_BISECT:v=>`[${v.a},${v.a+.5}]`,
};
const choiceLabels={
 PW_ABS_RULE:'3 - x',
 PW_CONFLICT:'At x = 1 the rules assign two different outputs, 2 and 3.',
 PW_AGREE:'Yes: the only overlap is at 0 and both rules give 0.',
 PW_NOT_INJECTIVE:'No: inputs -2 and 2 both give 2, so an inverse would have two outputs there.',
 PW_NO_AVERAGE:'f(0) = 5 because the second condition includes 0.',
 PW_INPUT_SIGN:'The input -2 is negative, so f(-2) = -(-2) = 2.',
 RATE_REVERSE:'It stays the same because both numerator and denominator change sign.',
 RATE_ZERO:'The endpoint outputs are equal; it does not establish that f is constant inside the interval.',
 RATE_NEARBY:'The rates are 4.1 and 4.01; these are rates on two different intervals.',
 RATE_UNITS:'A net decrease averaging 1.5 thousand residents per year over the chosen interval.',
 LIM_TABLE:'It suggests a left-side trend but cannot by itself prove the two-sided limit.',
 LIM_INDETERMINATE:'The form is indeterminate; further analysis of nearby values is needed.',
 LIM_POINT_CHANGE:'The other has the same limit 7, regardless of its assigned value at 2.',
 CONT_JUMP_REPAIR:'No: the unequal one-sided limits cannot be changed by assigning a single point value.',
 CONT_INFINITE_REPAIR:'No: the nearby values are unbounded, so there is no finite limit to match.',
 CONT_GRAPH_TYPE:'A jump: the finite one-sided limits exist but are unequal.',
 CONT_IVT_ROOT:'At least one zero at an input strictly between the endpoints.',
 CONT_IVT_TARGET:'At least one interior input has output equal to the stated target.',
 CONT_NOT_UNIQUE:'No: it guarantees at least one, and this polynomial actually has roots -1, 0, and 1.',
 CONT_MISSING_HYPOTHESIS:'The function is not defined and continuous on the entire interval because 0 is excluded.',
 CONT_NO_SIGN_CHANGE:'The sign-change test is inconclusive; x^2 still has a zero at 0.',
 CONT_ENDPOINT:'Yes: its right-hand limit is 0, equal to its defined endpoint value.',
 CONT_EXTENSION:'A continuous extension; it does not mean the original function was defined at 2.',
 CONT_CORNER:'Yes: both one-sided limits are 0 and the function value is 0.',
 CONT_IVT_PROOF:'There is at least one real root in (0, 1).',
};
const oracle=p=>key(p) in formulas?String(formulas[key(p)](vals(p))):p.options.find(o=>o.label===choiceLabels[key(p)])?.id;
const proofText={
 PW_PROOF:'Solve each branch separately. x^2=4 gives -2 and 2, but x<1 keeps only -2. The other branch x+3=4 gives x=1, which satisfies x>=1. Both retained inputs give 4. The two regions cover the domain, so no other cases remain.',
 RATE_PROOF:'For h!=0, ((x+h)^2-x^2)/h = (2xh+h^2)/h = h(2x+h)/h = 2x+h. This cancellation uses h!=0. At h=0 the original denominator is zero, so it remains undefined despite the simplified expression being defined.',
 LIM_PROOF:'For x!=3, factor x^2-9=(x-3)(x+3) and cancel the nonzero factor x-3. Thus all nearby values away from 3 equal x+3 and approach 6 from both sides. A limit ignores the single target input, so f(3)=100 does not change the limit.',
 CONT_IVT_PROOF:'The polynomial x^3+x-1 is continuous on the entire closed interval [0,1]. Its values at 0 and 1 are -1 and 1. Zero is strictly between those heights. The intermediate value theorem gives at least one c in (0,1) with f(c)=0. This use of the theorem proves existence, not uniqueness or an exact location.',
};
function workFor(p){
 const v=vals(p);const result=oracle(p);
 const expressions={
  PW_MATCH:()=>`(${v.m}*${v.h}+(${v.b}))-${v.h}`,
  PW_TARIFF:()=>`${v.r}*${v.k}+${v.q}*(${v.k+v.d}-${v.k})`,
  RATE_QUADRATIC:()=>`((${v.p}*(${v.a+v.gap})^2+(${v.q})*(${v.a+v.gap})+(${v.c}))-(${v.p}*(${v.a})^2+(${v.q})*(${v.a})+(${v.c})))/${v.gap}`,
  RATE_POSITION:()=>`((${v.a+v.gap})^2-(${v.a})^2)/${v.gap}`,
  RATE_SECANT_LINE:()=>`(${2*v.a+v.gap})*x+(${-v.a*(v.a+v.gap)})`,
  RATE_DQ_QUADRATIC:()=>`(${v.p}*(x+h)^2+(${v.q})*(x+h)+(${v.c})-(${v.p}*x^2+(${v.q})*x+(${v.c})))/h`,
  RATE_DQ_AT_A:()=>`(${v.p}*(${v.a}+h)^2+(${v.q})*(${v.a}+h)+(${v.c})-(${v.p}*(${v.a})^2+(${v.q})*(${v.a})+(${v.c})))/h`,
  CONT_LINEAR_JOIN:()=>`(${v.m}*${v.h}+(${v.b}))-${v.h}`,
  CONT_PRODUCT_JOIN:()=>`${v.h}^2/${v.h}`,
 };
 if(p.work.mode==='procedural_steps'){
  assert.ok(expressions[key(p)],'Missing independent worked solution for '+key(p));
  return expressions[key(p)]()+'\n'+result;
 }
 return proofText[key(p)]??'';
}

test('four lessons add a coherent graph and an explicit Calculus branch without rewriting earlier lessons',()=>{
 assert.equal(additions.length,4);assert.equal(curriculum.skills.length,112);
 assert.equal(Object.keys(formulas).length+Object.keys(choiceLabels).length,80);
 const all=new Map(curriculum.skills.map(s=>[s.id,s]));assert.equal(all.size,curriculum.skills.length);
 const visiting=new Set(),visited=new Set();
 function visit(id){assert.ok(all.has(id),'Missing prerequisite '+id);assert.ok(!visiting.has(id),'Cycle at '+id);if(visited.has(id))return;visiting.add(id);all.get(id).prerequisites.forEach(visit);visiting.delete(id);visited.add(id);}
 all.forEach(s=>visit(s.id));
 for(const s of additions){
  assert.equal(s.examples.length,10);assert.equal(s.applications.length,4);assert.ok(s.theory.split(/\s+/).length>=750);
  assert.equal(s.question_count,['MATH_FUNC_004','MATH_FUNC_007','MATH_CALC_001','MATH_CALC_002'].includes(s.id)?21:20);assert.equal(s.native_templates.filter(t=>!t.proof_spec).length,20);
  assert.equal(new Set(s.problems.map(p=>p.source_template_id)).size,s.native_templates.length);
  assert.ok(s.problems.length>=40 && s.problems.length<=100);
  assert.equal(s.native_templates.filter(t=>t.review_policy.mastery_requires_review_pass).length,1);
 }
 assert.ok(standardBranches('SUBJECT_MATH').includes('Calculus'));
 const fields=learningFields([{id:'SUBJECT_MATH',name:'Mathematics'}],curriculum.skills.map(s=>({...s,subjectId:'SUBJECT_MATH'})));
 assert.deepEqual(fields[0].branches.find(b=>b.name==='Calculus').skillIds,['MATH_CALC_001','MATH_CALC_002']);
});

test('all 80 scenarios satisfy independent oracles over 100 retakes each, with no generator fallback',()=>{
 const store=makeStore();const seen=new Set(),diversity=new Map();
 for(let variation=0;variation<100;variation++)for(const s of additions){
  const problems=store.previewNativeAssessment(s.id,variation).problems;assert.equal(problems.length,s.question_count);
  for(const p of problems){
   if(p.proof_spec){assert.equal(gradeProblem(p,p.expected_answer).correct,false);continue;}
   seen.add(key(p));assert.match(p.template_id,/__RUNTIME_/);assert.doesNotMatch(p.prompt,/\{[^}]+\}/);
   assert.ok(p.solution_steps.length);const answer=oracle(p);assert.notEqual(answer,undefined,key(p));
   assert.equal(gradeProblem(p,answer).correct,true,`${key(p)} independent result ${answer} for variation ${variation}`);
   assert.equal(gradeProblem(p,p.expected_answer).correct,true,key(p)+' authored answer');
   if(p.grading_method==='multiple_choice')for(const o of p.options)assert.equal(gradeProblem(p,o.id).correct,o.id===answer,key(p)+' distractor');
   else if(p.grading_method==='exact_numeric'){
    const numeric=Number(p.expected_answer.includes('/')?p.expected_answer.split('/')[0]/p.expected_answer.split('/')[1]:p.expected_answer);
    assert.equal(gradeProblem(p,String(numeric+1)).correct,false,key(p)+' numeric error');
   }else if(p.grading_method==='symbolic_expression')assert.equal(gradeProblem(p,`(${answer})+1`).correct,false,key(p)+' shifted expression');
   if(p.work.mode==='procedural_steps')assert.equal(validateProceduralWork(p,workFor(p),null,answer),null,key(p)+' valid algebra');
   if(p.media?.length)assert.deepEqual(p.values,{},'Assessment pictures are fixed to their actual givens');
   if(!diversity.has(key(p)))diversity.set(key(p),new Set());diversity.get(key(p)).add(p.prompt);
  }
 }
 assert.equal(seen.size,80);
 for(const s of additions)for(const t of s.native_templates.filter(t=>t.type==='generated'))assert.ok(diversity.get(t.id.replace(/^BRIDGE_/,''))?.size>=3,t.id+' variation diversity');
});

test('point values, endpoint rules, cancelled holes, speed, and infinity traps reject plausible wrong answers',()=>{
 const bank=additions.flatMap(s=>makeStore().previewNativeAssessment(s.id,3).problems);
 const errors={PW_ENDPOINTS:'[0,4]',PW_FILTER:'{-2,-1,1}',PW_RANGE_GRAPH:'[0,3]',PW_VALUE_GRAPH:'2',PW_PROOF:'{-2,1,2}',RATE_TABLE:'-3',RATE_SPEED:'0',RATE_GRAPH:'4',LIM_JUMP:'2',LIM_GRAPH:'5',LIM_OPPOSITE_INFINITY:'+inf',LIM_PROOF:'100'};
 for(const[id,wrong]of Object.entries(errors))assert.equal(gradeProblem(bank.find(p=>key(p)===id),wrong).correct,false,id);
 for(const p of bank.filter(p=>['LIM_INFINITE_RIGHT','LIM_INFINITE_LEFT','LIM_INFINITE_SQUARE','LIM_OPPOSITE_INFINITY'].includes(key(p)))){
  for(const value of ['+inf','-inf','DNE','0'])assert.equal(gradeProblem(p,value).correct,value===oracle(p),key(p)+' '+value);
 }
 const q=bank.find(p=>key(p)==='RATE_DQ_DOMAIN'),a=vals(q).a;
 assert.equal(gradeProblem(q,except(-a)).correct,false,'Cancellation must not restore h=0');
 const continuity=bank.find(p=>key(p)==='CONT_CANCELLED_DOMAIN');assert.equal(gradeProblem(continuity,'(-inf,inf)').correct,false);
});

test('equivalent algebra is accepted, while missing or invalid procedural work is rejected',()=>{
 const bank=additions.flatMap(s=>makeStore().previewNativeAssessment(s.id,4).problems);
 for(const p of bank.filter(p=>p.work.mode==='procedural_steps')){
  const good=workFor(p);assert.equal(validateProceduralWork(p,good,null,oracle(p)),null);
  assert.notEqual(validateProceduralWork(p,''),null,key(p)+' missing work');
  assert.notEqual(validateProceduralWork(p,'99999\n'+oracle(p),null,oracle(p)),null,key(p)+' invalid first line');
 }
 const cubic=bank.find(p=>key(p)==='RATE_DQ_CUBIC');
 assert.equal(gradeProblem(cubic,'3*x*x + 3*h*x + h*h').correct,true);
 assert.equal(gradeProblem(cubic,'3*x^2 + h^2').correct,false,'Missing cross term must fail');
 const q=bank.find(p=>key(p)==='LIM_CONJUGATE');
 assert.equal(gradeProblem(q,String(1/(2*vals(q).r))).correct,true);
});

test('ordinary review fixture stays Learning until the required argument passes a permitted review',()=>{
 for(const s of additions){
  const store=makeStore(ordinaryReviewCurriculum());store.createProfile('Calculus bridge review');store.setLearningPreferences({progressionMode:'soft'});
  const draft=store.startTest(s.id);const reviewed=draft.problems.find(p=>p.review_policy.mastery_requires_review_pass);
  for(const p of draft.problems)store.updateResponse(p.template_id,{finalAnswer:oracle(p),work:workFor(p)});
  assert.equal(store.submitTest().ok,true,s.id);const attempt=store.saveReflection({confidenceRating:4,guessed:'no'});
  assert.equal(attempt.percentScore,1);assert.equal(attempt.hasPendingReview,true);assert.equal(store.statusForSkill(s.id),'learning');
  assert.throws(()=>store.recordTutorFeedback({questionId:reviewed.template_id,reviewerType:'self',feedback:'Self checked.',nextStep:'Continue.'}),/tutor review/);
  const guide=store.inspectStudentWork({questionId:reviewed.template_id}).review_guide;
  const review={questionId:reviewed.template_id,reviewerType:'human_tutor',feedback:'All stated mathematical obligations are established.',nextStep:'Continue with the next lesson.',
   obligationResults:guide.proof_obligations.map(o=>({id:o.id,status:'satisfied',note:'Explicitly justified on the stated domain.'})),
   rubricResults:guide.rubric_criteria.map(c=>({id:c.id,awardedPoints:c.weight,note:'Criterion met.'}))};
  assert.equal(store.recordTutorFeedback(review).verdict,'pass');assert.equal(store.statusForSkill(s.id),'proven');
 }
});

function previousCurriculum(){
 const previous=structuredClone(curriculum);previous.skills=previous.skills.filter(s=>!ids.includes(s.id));
 previous.track.skills=previous.track.skills.filter(id=>!ids.includes(id));previous.track.exit_skills=previous.track.exit_skills.filter(id=>!ids.includes(id));
 previous.assets=previous.assets.filter(a=>!a.path.startsWith('media/native-calculus-bridge/'));return previous;
}
test('new lessons preserve existing mastery, profiles, map positions, unfinished work, and previous native content',()=>{
 const previous=previousCurriculum();const old=makeStore(previous);const profile=old.createProfile('Returning learner');
 old.setMapPlanMode(true);old.updateMapPlanLayout({layoutKey:'all-subjects',positions:{MATH_FUNC_002:{x:345,y:678},MATH_FUNC_005:{x:700,y:720}}});
 old.startTest('MATH_ARITH_001');const q=old.snapshot().activeTest.problems[0];old.updateResponse(q.template_id,{finalAnswer:'saved answer',work:'saved working'});
 const saved=JSON.parse(old.exportSyncState());saved.progress[profile.id].MATH_FUNC_005={status:'proven',masteryScore:84,confidenceRating:4,updatedAt:'2026-09-09T13:00:00Z'};
 const before=makeStore(previous,JSON.stringify(saved)),after=makeStore(curriculum,JSON.stringify(saved));
 const a=JSON.parse(before.exportSyncState()),b=JSON.parse(after.exportSyncState());
 for(const key of ['progress','drafts','mapPlans','profiles'])assert.deepEqual(b[key],a[key],key);
 for(const s of previous.skills)assert.deepEqual(before.skillsById[s.id],after.skillsById[s.id],s.id);
 const restored=makeStore();restored.importBackup(after.exportBackup());assert.deepEqual(JSON.parse(restored.exportSyncState()).drafts,b.drafts);
});

test('Hard path enforces explicit Batch 1 and within-batch prerequisites; Open path remains available',()=>{
 const store=makeStore();const profile=store.createProfile('Prerequisite check');
 for(const id of ids){assert.equal(store.statusForSkill(id),'locked');assert.throws(()=>store.startTest(id),/locked/);}
 const data=JSON.parse(store.exportSyncState());
 for(const pre of additions[0].prerequisites)data.progress[profile.id][pre]={status:'proven',masteryScore:85,confidenceRating:4};
 const ready=makeStore(curriculum,JSON.stringify(data));assert.equal(ready.statusForSkill(ids[0]),'ready');assert.doesNotThrow(()=>ready.startTest(ids[0]));
 ready.setLearningPreferences({progressionMode:'soft'});assert.doesNotThrow(()=>ready.startTest('MATH_CALC_002'));
});

test('the twelve new SVGs are byte-verified, accessible, fixed to assessment givens, and usable offline',async()=>{
 const assets=curriculum.assets.filter(a=>a.path.startsWith('media/native-calculus-bridge/'));assert.equal(assets.length,12);
 const used=new Set();
 for(const s of additions)for(const row of [s,...s.examples,...s.applications,...s.problems])for(const m of row.media??[]){
  assert.ok(m.alt && m.caption && m.width && m.height);assert.equal(m.fit,'contain');used.add(m.src);
 }
 assert.deepEqual([...used].sort(),assets.map(a=>a.path).sort());
 assert.ok(curriculum.assets.reduce((n,a)=>n+a.bytes,0)<1_000_000);
 for(const a of assets){
  const data=readFileSync(new URL('../content/math/algebra_foundations/skills/'+a.path,import.meta.url));
  assert.equal(data.length,a.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),a.sha256);
  assert.doesNotMatch(data.toString(),/<script|<foreignObject/i);
  const loaded=await loadLessonAsset(a,'',{fetchImpl(){throw new Error('Unexpected network request');}});
  assert.deepEqual(Buffer.from(loaded),data);
 }
});

test('restored native test drafts and saved results retain their original illustrated question data',()=>{
 const store=makeStore(ordinaryReviewCurriculum());store.createProfile('Diagram restoration');store.setLearningPreferences({progressionMode:'soft'});
 const draft=store.startTest('MATH_CALC_001');const picture=draft.problems.find(p=>key(p)==='LIM_GRAPH');
 store.updateResponse(picture.template_id,{finalAnswer:'2',work:'Both sides approach height 2.'});
 const restored=makeStore(curriculum,store.exportSyncState());
 const same=restored.snapshot().activeTest.problems.find(p=>p.template_id===picture.template_id);
 assert.deepEqual(same.media,picture.media);assert.equal(same.prompt,picture.prompt);
 for(const p of restored.snapshot().activeTest.problems)restored.updateResponse(p.template_id,{finalAnswer:oracle(p),work:workFor(p)});
 assert.equal(restored.submitTest().ok,true);const attempt=restored.saveReflection({confidenceRating:4,guessed:'no'});
 const result=restored.getAttempt(attempt.attemptId);
 // The exact question object, not a newly generated graph, travels in the attempt.
 assert.ok(JSON.stringify(result).includes('media/native-calculus-bridge/limit-hole.svg'));
});

// Every-attempt teaching contract: neither formal additions nor rotation may omit the capstone.
test('every retake retains the original reviewed capstone alongside formal work',()=>{
 const store=makeStore();
 for(const s of additions){
  const required=s.native_templates.filter(t=>t.review_policy.mastery_requires_review_pass || t.proof_spec);
  for(let attempt=0;attempt<100;attempt++){
   const problems=store.previewNativeAssessment(s.id,attempt).problems;
   for(const t of required){
    const p=problems.find(p=>p.source_template_id===t.id);
    assert.ok(p,`${s.id} attempt ${attempt} omitted ${t.id}`);
    if(t.review_policy.mastery_requires_review_pass)assert.equal(p.review_policy.mastery_requires_review_pass,true);
    if(t.proof_spec)assert.equal(gradeProblem(p,p.expected_answer).correct,false);
   }
  }
 }
});

// Isolate the pre-existing ordinary review lifecycle; full-catalog retention and
// formal rejection are tested independently without manufacturing certificates.
function ordinaryReviewCurriculum(){
 const data=structuredClone(curriculum);
 for(const skill of data.skills){
  skill.native_templates=skill.native_templates?.filter(t=>!t.proof_spec);
  skill.problems=skill.problems.filter(p=>!p.proof_spec);
  if(skill.native_templates?.length)skill.question_count=Math.min(skill.question_count,skill.native_templates.length);
 }
 return data;
}

test('full assessments reject ordinary answers in place of formal verification',()=>{
 for(const s of additions.filter(s=>s.native_templates.some(t=>t.proof_spec))){
  const store=makeStore();store.createProfile('Unverified formal work');store.setLearningPreferences({progressionMode:'soft'});
  const draft=store.startTest(s.id);
  assert.ok(draft.problems.some(p=>p.proof_spec));
  assert.ok(draft.problems.some(p=>p.review_policy.mastery_requires_review_pass));
  for(const p of draft.problems)store.updateResponse(p.template_id,{finalAnswer:p.proof_spec?p.expected_answer:oracle(p),work:p.proof_spec?'':workFor(p)});
  assert.equal(store.submitTest().ok,false,s.id);
 }
});
