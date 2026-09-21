import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createQuickMathsStore, gradeProblem, validateProceduralWork, STORAGE_KEY } from './challenge-core.js';
import { loadLessonAsset } from './lesson-media.js';

const curriculum=JSON.parse(readFileSync(new URL('./curriculum-data.json',import.meta.url),'utf8'));
const ids=['MATH_FUNC_002','MATH_FUNC_003','MATH_FUNC_004','MATH_FUNC_005'];
const additions=curriculum.skills.filter(s=>ids.includes(s.id));
const storeFor=(data=curriculum,initial=null)=>createQuickMathsStore({curriculum:data,now:()=>new Date('2026-09-09T12:51:36Z'),storage:{getItem:k=>k===STORAGE_KEY?initial:null,setItem(){}}});
const vals=p=>Object.fromEntries(Object.entries(p.values).map(([k,v])=>[k,Number(v)]));
const minusPoint=h=>`(-inf, ${h}) U (${h}, inf)`;
// Oracles are derived from the mathematical rules, not the generated answer key.
// Intermediate values are recomputed from the original independent variables.
const answers={
 DOMAIN_POLYNOMIAL:()=> '(-inf, inf)', DOMAIN_RATIONAL:v=>minusPoint(v.h),
 DOMAIN_TWO_POLES:v=>`(-inf, ${v.a}) U (${v.a}, ${v.a+v.gap}) U (${v.a+v.gap}, inf)`,
 DOMAIN_SQRT_LOWER:v=>`[${v.h}, inf)`, DOMAIN_SQRT_UPPER:v=>`(-inf, ${v.h}]`,
 DOMAIN_RECIPROCAL_SQRT:v=>`(${v.h}, inf)`,
 DOMAIN_INTERSECTION:v=>`[${v.h}, ${v.h+v.gap}) U (${v.h+v.gap}, inf)`,
 DOMAIN_CANCELLED_FACTOR:()=>minusPoint(3),
 RANGE_QUADRATIC_UP:v=>`[${v.k}, inf)`, RANGE_QUADRATIC_DOWN:v=>`(-inf, ${v.k}]`,
 RANGE_ABSOLUTE:v=>`[${v.k}, inf)`,
 RANGE_RESTRICTED_LINEAR:v=>`[${v.m*v.l+v.b}, ${v.m*(v.l+v.gap)+v.b})`,
 RANGE_RESTRICTED_QUADRATIC:v=>`[${v.k}, ${v.k+(v.p+v.extra)**2})`,
 DOMAIN_FINITE_RELATION:()=>'{3, -2, 0}', RANGE_FINITE_RELATION:()=>'{5, 1}',
 DOMAIN_SEGMENT_GRAPH:()=> '(-2, 3]', RANGE_SEGMENT_GRAPH:()=> '(1, 4]',
 RANGE_HOLE_REASONING:()=>minusPoint(4),
 TRANS_VERTICAL_SHIFT:v=>v.v+v.k, TRANS_OUTPUT_SCALE:v=>-v.a*v.v+v.k,
 TRANS_HORIZONTAL_SHIFT:v=>v.u+v.h, TRANS_HORIZONTAL_SCALE:v=>v.u/v.b,
 TRANS_COMBINED_INPUT:v=>v.h+v.u/v.b, TRANS_COMBINED_OUTPUT:v=>-v.a*v.v+v.k,
 TRANS_QUADRATIC_FORMULA:v=>`${v.a}*x^2 + ${-2*v.a*v.h}*x + ${v.a*v.h*v.h+v.k}`,
 TRANS_ABSOLUTE_FORMULA:()=> '1-2*abs(3+x)', TRANS_SQRT_DOMAIN:v=>`(-inf, ${v.h}]`,
 TRANS_DOMAIN_SHIFT:v=>`[${v.l+v.h}, ${v.l+v.gap+v.h})`,
 TRANS_DOMAIN_REFLECTION:v=>`(${v.h-(v.p+v.gap)}, ${v.h-v.p}]`,
 TRANS_RANGE_NEGATIVE:v=>`[${v.k-v.a*(v.l+v.gap)}, ${v.k-v.a*v.l}]`,
 TRANS_OPERATION_ORDER:()=>14, TRANS_GRAPH_RANGE:()=> '(-inf, 4]',
 COMP_AFFINE_AFTER_SQUARE:v=>v.a*(v.r*v.r+v.c)+v.b,
 COMP_SQUARE_AFTER_AFFINE:v=>(v.a*v.r+v.b)**2+v.c,
 COMP_TABLE_CHAIN:()=>5,
 COMP_AFFINE_FORMULA:v=>`${v.a}*(${v.m}*x+(${v.n}))+(${v.b})`,
 COMP_QUADRATIC_FORMULA:v=>`${v.m*v.m}*x^2+${2*v.m*v.n}*x+${v.n*v.n+v.k}`,
 COMP_LINEAR_OF_QUADRATIC:v=>`${v.a}*(x^2+(${v.k}))+(${v.b})`,
 COMP_SOLVE_LINEAR:v=>(v.target-v.b-v.a*v.n)/(v.a*v.m),
 COMP_RATIONAL_OUTER_DOMAIN:v=>minusPoint(v.c-v.b),
 COMP_SQRT_OUTER_POSITIVE:v=>`[${(v.h-v.b)/v.m}, inf)`,
 COMP_SQRT_OUTER_NEGATIVE:v=>`(-inf, ${(v.b-v.h)/v.m}]`,
 COMP_SQUARE_OF_ROOT_DOMAIN:()=> '[2, inf)', COMP_RECIPROCAL_CANCELLATION:()=>minusPoint(3),
 COMP_TWO_DOMAIN_RESTRICTIONS:v=>`(-inf, ${v.b}) U (${v.b}, ${v.b+1}) U (${v.b+1}, inf)`,
 COMP_ROOT_OF_SQUARE_DOMAIN:()=> '(-inf, inf)', COMP_PRICE_ORDER:()=>50*.8+5,
 COMP_THREE_STAGES:v=>2*(v.r-3)**2+1, COMP_DOMAIN_REASONING:()=> '[2, inf)',
 INV_TABLE:()=>5, INV_AFFINE_FORMULA:v=>`x/${v.a}-(${v.b})/${v.a}`,
 INV_AFFINE_VALUE:v=>(v.target-v.b)/v.a, INV_DECREASING_AFFINE:v=>`(${v.b})/${v.a}-x/${v.a}`,
 INV_RECIPROCAL_FORMULA:v=>`(${v.h}*(x-(${v.k}))+(${v.a}))/(x-(${v.k}))`,
 INV_RECIPROCAL_DOMAIN:v=>minusPoint(v.k), INV_RECIPROCAL_RANGE:v=>minusPoint(v.h),
 INV_QUADRATIC_RIGHT:v=>`sqrt(x+(${-v.k}))+(${v.h})`,
 INV_QUADRATIC_LEFT:v=>`-sqrt(x+(${-v.k}))+(${v.h})`,
 INV_ROOT_FORMULA:v=>`x^2+${-2*v.k}*x+${v.k*v.k+v.h}`,
 INV_ROOT_DOMAIN:v=>`[${v.k}, inf)`, INV_GRAPH_POINT:()=>3,
 INV_RESTRICTED_AFFINE_DOMAIN:v=>`[${v.a*v.l+v.b}, ${v.a*(v.l+v.gap)+v.b})`,
 INV_CALIBRATION:v=>(v.reported-v.b)/v.a, INV_BRANCH_PROOF:()=> 'sqrt(x-1)+2',
};
const choices={
 DOMAIN_DISCRETE_CONTEXT:'The integers from 0 through 24, inclusive',
 RANGE_CODOMAIN:'The codomain is R, but the range is [0, inf)',
 TRANS_INSIDE_OUTSIDE:'g(x) = f(x) + 3', TRANS_REFLECTION_AXIS:'f(-x)',
 TRANS_FACTOR_INSIDE:'Compress horizontally by factor 1/2, then shift right by 3',
 TRANS_GRAPH_FORMULA:'g(x) = -(x + 1)^2 + 4',
 TRANS_POINT_CHECK:'The new point is (1, 5), because 2*1 reproduces the original input 2',
 TRANS_MAPPING_PROOF:'(h + u/b, a*v + k)',
 COMP_NOT_MULTIPLICATION:'Evaluate g at x, then use that output as the input to f',
 COMP_ROOT_OF_SQUARE_VALUE:'It equals |x| for every real x',
 COMP_NONCOMMUTATIVE:'f(g(x)) = 2x + 1, while g(f(x)) = 2x + 2, so they differ for every x',
 INV_NOT_RECIPROCAL:'The input that f sends to x',
 INV_VERIFY_BOTH:'Both f(g(x)) = x and g(f(x)) = x for every real x',
 INV_WRONG_SIGN:'Undoing subtraction of 4 requires adding 4 before dividing by 3',
 INV_HORIZONTAL_LINE:'f is a function but is not one-to-one, so it has no inverse function on its full domain',
 INV_COMPOSITION_ORDER:'Apply f^(-1) first, then g^(-1), giving g^(-1)(f^(-1)(x))',
};
const key=p=>p.source_template_id.replace(/^FUNC_/,'').replace(/_001$/,'');
const oracle=p=>key(p) in answers?String(answers[key(p)](vals(p))):p.options.find(o=>o.label===choices[key(p)])?.id;

function workFor(p){
  const v=vals(p);const end=oracle(p);const setups={
    TRANS_OUTPUT_SCALE:()=>`-${v.a}*(${v.v})+(${v.k})`,
    TRANS_QUADRATIC_FORMULA:()=>`${v.a}*(x-(${v.h}))^2+(${v.k})`,
    COMP_AFFINE_AFTER_SQUARE:()=>`${v.a}*((${v.r})^2+(${v.c}))+(${v.b})`,
    COMP_SQUARE_AFTER_AFFINE:()=>`(${v.a}*(${v.r})+(${v.b}))^2+(${v.c})`,
    COMP_AFFINE_FORMULA:()=>`${v.a*v.m}*x+(${v.a*v.n+v.b})`,
    COMP_SOLVE_LINEAR:()=>`${v.a}*(${v.m}*x+(${v.n}))+(${v.b})=${v.target}`,
    COMP_THREE_STAGES:()=>`2*((${v.r})-3)^2+1`,
    INV_AFFINE_VALUE:()=>`((${v.target})-(${v.b}))/(${v.a})`,
    INV_CALIBRATION:()=>`((${v.reported})-(${v.b}))/(${v.a})`,
  };
  if(p.work.mode==='procedural_steps'){
    assert.ok(setups[key(p)],`Missing worked-solution oracle ${key(p)}`);
    return setups[key(p)]()+'\n'+(p.work.line_type==='equation'?'x='+end:end);
  }
  if(['proof_obligations','rubric_check'].includes(p.work.mode))return p.solution_steps.join('\n');
  return '';
}

test('four native function lessons have complete teaching, metadata, scenarios, and an acyclic prerequisite graph',()=>{
  assert.deepEqual(additions.map(s=>s.id),ids);
  assert.equal(curriculum.skills.length,new Set(curriculum.skills.map(s=>s.id)).size);
  const all=new Map(curriculum.skills.map(s=>[s.id,s]));const visiting=new Set(),visited=new Set();
  function visit(id){assert.ok(all.has(id),`Missing prerequisite ${id}`);assert.ok(!visiting.has(id),`Cycle at ${id}`);if(visited.has(id))return;visiting.add(id);for(const pre of all.get(id).prerequisites)visit(pre);visiting.delete(id);visited.add(id);}
  for(const id of all.keys())visit(id);
  for(const s of additions){
    assert.equal(s.subdomain,'Algebra');assert.equal(s.topic,'Functions');
    assert.equal(s.examples.length,10);assert.equal(s.applications.length,4);assert.ok(s.theory.split(/\s+/).length>=750);
    assert.equal(s.question_count,['MATH_FUNC_004','MATH_FUNC_007','MATH_CALC_001','MATH_CALC_002'].includes(s.id)?21:20);assert.equal(s.native_templates.filter(t=>!t.proof_spec).length,20);
    assert.equal(new Set(s.native_templates.map(t=>t.id)).size,s.native_templates.length);
    assert.equal(new Set(s.problems.map(p=>p.source_template_id)).size,s.native_templates.length);
    assert.ok(s.problems.length>=40 && s.problems.length<=100);
    assert.equal(s.native_templates.filter(t=>t.review_policy.mastery_requires_review_pass).length,1);
    for(const t of s.native_templates){assert.ok(t.explanation_template && t.mistake_tags.length);assert.ok(t.answer && t.grading && t.review_policy);}
  }
});

test('all 80 scenarios pass independent mathematical oracles across 100 fresh retakes, without fallback',()=>{
  const store=storeFor();const seen=new Set();const diversity=new Map();
  assert.equal(Object.keys(answers).length+Object.keys(choices).length,80);
  for(let n=0;n<100;n++)for(const s of additions){
    const draft=store.previewNativeAssessment(s.id,n);assert.equal(draft.problems.length,s.question_count);
    for(const p of draft.problems){
      if(p.proof_spec){assert.equal(gradeProblem(p,p.expected_answer).correct,false);continue;}
      seen.add(key(p));assert.match(p.template_id,/__RUNTIME_/);
      assert.doesNotMatch(p.prompt,/\{[^}]+\}/);assert.ok(p.solution_steps.length);
      const answer=oracle(p);assert.notEqual(answer,undefined,`No independent oracle: ${key(p)}`);
      assert.equal(gradeProblem(p,answer).correct,true,`${n} ${key(p)}: ${answer}`);
      assert.equal(gradeProblem(p,p.expected_answer).correct,true,`${key(p)} answer key`);
      if(p.grading_method==='multiple_choice')for(const o of p.options)assert.equal(gradeProblem(p,o.id).correct,o.id===answer,`${key(p)} distractor`);
      else if(['exact_numeric','equation_solution'].includes(p.grading_method))assert.equal(gradeProblem(p,String(Number(answer)+1)).correct,false);
      else if(p.grading_method==='symbolic_expression')assert.equal(gradeProblem(p,`(${answer})+1`).correct,false,`${key(p)} wrong expression`);
      if(p.work.mode==='procedural_steps')assert.equal(validateProceduralWork(p,workFor(p),null,answer),null,`${key(p)} valid working`);
      if(p.media?.length)assert.deepEqual(p.values,{},'Fixed image values must not be randomized');
      if(!diversity.has(key(p)))diversity.set(key(p),new Set());diversity.get(key(p)).add(p.prompt);
    }
  }
  assert.equal(seen.size,80);
  for(const s of additions)for(const t of s.native_templates.filter(t=>t.type==='generated'))assert.ok(diversity.get(t.id.slice(5,-4)).size>=3,`${t.id} needs fresh values`);
});

test('endpoint, missing-hole, root-sign, and transformation-order traps reject plausible wrong answers',()=>{
  const store=storeFor();const bank=additions.flatMap(s=>store.previewNativeAssessment(s.id,0).problems);
  const cases={DOMAIN_CANCELLED_FACTOR:'(-inf, inf)',RANGE_HOLE_REASONING:'(-inf, inf)',DOMAIN_SEGMENT_GRAPH:'[-2, 3]',RANGE_SEGMENT_GRAPH:'[1, 4]',COMP_SQUARE_OF_ROOT_DOMAIN:'(-inf, inf)',COMP_RECIPROCAL_CANCELLATION:'(-inf, inf)',COMP_DOMAIN_REASONING:'(-inf, -2] U [2, inf)',TRANS_OPERATION_ORDER:'11',COMP_PRICE_ORDER:'44',INV_BRANCH_PROOF:'2-sqrt(x-1)'};
  for(const [id,wrong]of Object.entries(cases)){const p=bank.find(p=>key(p)===id);assert.equal(gradeProblem(p,wrong).correct,false,id);}
  for(const p of bank.filter(p=>p.work.mode==='procedural_steps')){
    assert.notEqual(validateProceduralWork(p,''),null,`${key(p)} missing work`);
    const good=workFor(p).split('\n');good[0]=p.work.line_type==='equation'?'x=99999':'99999';
    assert.notEqual(validateProceduralWork(p,good.join('\n'),null,oracle(p)),null,`${key(p)} invalid equivalence`);
  }
});

test('ordinary review fixture remains Learning until its authored proof or rubric review passes',()=>{
  for(const s of additions){
    const store=storeFor(ordinaryReviewCurriculum());store.createProfile('Functions review regression');store.setLearningPreferences({progressionMode:'soft'});
    const draft=store.startTest(s.id);const reviewed=draft.problems.find(p=>p.review_policy.mastery_requires_review_pass);
    for(const p of draft.problems)store.updateResponse(p.template_id,{finalAnswer:oracle(p),work:workFor(p)});
    assert.equal(store.submitTest().ok,true,s.id);const attempt=store.saveReflection({confidenceRating:4,guessed:'no'});
    assert.equal(attempt.percentScore,1);assert.equal(attempt.hasPendingReview,true);assert.equal(store.statusForSkill(s.id),'learning');
    assert.throws(()=>store.recordTutorFeedback({questionId:reviewed.template_id,reviewerType:'self',feedback:'Self check.',nextStep:'Continue.'}),/tutor review/);
    const inspect=store.inspectStudentWork({questionId:reviewed.template_id});
    const guide=inspect.review_guide;
    const review={questionId:reviewed.template_id,reviewerType:'human_tutor',feedback:'All authored logical milestones are satisfied.',nextStep:'Continue to the next lesson.',
      obligationResults:guide.proof_obligations.map(o=>({id:o.id,status:'satisfied',note:'Established on the stated domain.'})),
      rubricResults:guide.rubric_criteria.map(c=>({id:c.id,awardedPoints:c.weight,note:'The required reasoning is explicit.'}))};
    assert.equal(store.recordTutorFeedback(review).verdict,'pass');
    assert.equal(store.getAttempt(attempt.attemptId).reviewStatus,'review_passed');assert.equal(store.statusForSkill(s.id),'proven');
  }
});

test('native additions preserve existing progress, drafts, plans, IDs and content; Hard path uses their prerequisites',()=>{
  // Later native lessons may depend on Batch 1. Reconstruct a valid historical
  // fixture by removing those dependents too, rather than leaving dangling edges.
  const removed=new Set(ids);
  for(let changed=true;changed;){changed=false;for(const s of curriculum.skills)if(!removed.has(s.id)&&s.prerequisites.some(id=>removed.has(id))){removed.add(s.id);changed=true;}}
  const previous=structuredClone(curriculum);previous.skills=previous.skills.filter(s=>!removed.has(s.id));previous.track.skills=previous.track.skills.filter(id=>!removed.has(id));previous.track.exit_skills=previous.track.exit_skills.filter(id=>!removed.has(id));
  const old=storeFor(previous);const profile=old.createProfile('Returning learner');
  old.setMapPlanMode(true);old.updateMapPlanLayout({layoutKey:'all-subjects',positions:{MATH_FUNC_001:{x:345,y:678}}});
  old.startTest('MATH_ARITH_001');const q=old.snapshot().activeTest.problems[0];old.updateResponse(q.template_id,{finalAnswer:'saved answer',work:'saved working'});
  const saved=JSON.parse(old.exportSyncState());saved.progress[profile.id].MATH_FUNC_001={status:'proven',masteryScore:83,confidenceRating:4,updatedAt:'2026-09-09T12:00:00Z'};
  const before=storeFor(previous,JSON.stringify(saved));const updated=storeFor(curriculum,JSON.stringify(saved));
  const a=JSON.parse(before.exportSyncState()),b=JSON.parse(updated.exportSyncState());
  assert.deepEqual(b.progress,a.progress);assert.deepEqual(b.drafts,a.drafts);assert.deepEqual(b.mapPlans,a.mapPlans);assert.deepEqual(b.profiles,a.profiles);
  for(const s of previous.skills)assert.deepEqual(updated.skillsById[s.id],before.skillsById[s.id],s.id);
  assert.equal(updated.statusForSkill('MATH_FUNC_002'),'locked');assert.throws(()=>updated.startTest('MATH_FUNC_002'),/locked/);
  for(const pre of additions[0].prerequisites)saved.progress[profile.id][pre]={status:'proven',masteryScore:85,confidenceRating:4};
  const ready=storeFor(curriculum,JSON.stringify(saved));assert.equal(ready.statusForSkill('MATH_FUNC_002'),'ready');assert.doesNotThrow(()=>ready.startTest('MATH_FUNC_002'));
  const restored=storeFor();restored.importBackup(updated.exportBackup());assert.deepEqual(JSON.parse(restored.exportSyncState()).drafts,JSON.parse(updated.exportSyncState()).drafts);
});

test('all twelve new figures match source bytes and load offline with complete accessible metadata',async()=>{
  const assets=curriculum.assets.filter(a=>a.path.startsWith('media/native-functions/'));assert.equal(assets.length,12);
  const used=new Set();
  for(const s of additions)for(const row of [s,...s.examples,...s.applications,...s.problems])for(const m of row.media??[]){
    assert.ok(m.alt && m.caption && m.width && m.height);assert.equal(m.fit,'contain');used.add(m.src);
  }
  assert.deepEqual([...used].sort(),assets.map(a=>a.path).sort());
  assert.ok(curriculum.assets.reduce((n,a)=>n+a.bytes,0)<1_000_000);
  for(const asset of assets){
    const source=readFileSync(new URL('../content/math/algebra_foundations/skills/'+asset.path,import.meta.url));
    assert.equal(source.length,asset.bytes);assert.equal(createHash('sha256').update(source).digest('hex'),asset.sha256);
    const loaded=await loadLessonAsset(asset,'',{fetchImpl(){throw new Error('Unexpected network request');}});assert.deepEqual(Buffer.from(loaded),source);
  }
});

// Every-attempt teaching contract: neither formal additions nor rotation may omit the capstone.
test('every retake retains the original reviewed capstone alongside formal work',()=>{
 const store=storeFor();
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
  const store=storeFor();store.createProfile('Unverified formal work');store.setLearningPreferences({progressionMode:'soft'});
  const draft=store.startTest(s.id);
  assert.ok(draft.problems.some(p=>p.proof_spec));
  assert.ok(draft.problems.some(p=>p.review_policy.mastery_requires_review_pass));
  for(const p of draft.problems)store.updateResponse(p.template_id,{finalAnswer:p.proof_spec?p.expected_answer:oracle(p),work:p.proof_spec?'':workFor(p)});
  assert.equal(store.submitTest().ok,false,s.id);
 }
});
