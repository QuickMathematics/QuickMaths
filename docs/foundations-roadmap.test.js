import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createQuickMathsStore,gradeProblem,STORAGE_KEY} from './challenge-core.js';
import {createLessonStudio} from './lesson-creator.js';
import {loadLessonAsset} from './lesson-media.js';
const curriculum=JSON.parse(readFileSync(new URL('./curriculum-data.json',import.meta.url)));
const {lesson_ids:ids}=JSON.parse(readFileSync(new URL('./test-support/foundations-roadmap.json',import.meta.url)));
const storeFor=(c=curriculum,saved=null)=>createQuickMathsStore({curriculum:c,storage:{getItem:k=>k===STORAGE_KEY?saved:null,setItem(){}}});
const additions=curriculum.skills.filter(s=>ids.includes(s.id));
test('twenty foundation lessons have complete teaching and every-attempt capstones',()=>{
 assert.equal(additions.length,20);
 for(const s of additions){
  assert.equal(s.examples.length,10,s.id);assert.equal(s.applications.length,4,s.id);
  for(const a of s.applications)assert.ok(a.title?.trim() && a.description?.trim(),s.id+' visible application copy');
  assert.ok(s.theory.split(/\s+/).length>=650,s.id+' substantial teaching');
  assert.equal(s.question_count,20,s.id);assert.equal(s.native_templates.length,20,s.id);
  assert.equal(new Set(s.native_templates.map(t=>t.id)).size,20,s.id);
  const capstones=s.native_templates.filter(t=>t.review_policy.mastery_requires_review_pass);
  assert.equal(capstones.length,1,s.id);assert.equal(capstones[0].review_policy.allow_self_review,false);
  assert.equal(capstones[0].work.mode,'rubric_check');
 }
 const map=new Map(curriculum.skills.map(s=>[s.id,s])),seen=new Set(),active=new Set();
 function visit(id){assert.ok(map.has(id),id);assert.ok(!active.has(id),'cycle '+id);if(seen.has(id))return;active.add(id);map.get(id).prerequisites.forEach(visit);active.delete(id);seen.add(id);}
 ids.forEach(visit);assert.ok(curriculum.track.entry_skills.includes('MATH_ARITH_006'));
 assert.deepEqual(map.get('MATH_ARITH_006').prerequisites,[]);
});
test('100 generated assessments per new lesson retain distinct scenarios, reviewed reasoning and valid public graphs',()=>{
 const store=storeFor();
 for(const s of additions){
  const cap=s.native_templates.find(t=>t.review_policy.mastery_requires_review_pass).id;
  const expected=new Set(s.native_templates.map(t=>t.id));
  for(let seed=0;seed<100;seed++){
   const problems=store.previewNativeAssessment(s.id,seed).problems;
   assert.equal(problems.length,20,s.id);assert.deepEqual(new Set(problems.map(p=>p.source_template_id)),expected,s.id);
   assert.ok(problems.find(p=>p.source_template_id===cap).review_policy.mastery_requires_review_pass);
   for(const p of problems){
    assert.match(p.template_id,/__RUNTIME_/,p.template_id);assert.doesNotMatch(p.prompt,/\{[a-zA-Z_][a-zA-Z0-9_]*\}/);
    assert.ok(p.solution_steps.length,p.template_id);
    assert.equal(gradeProblem(p,p.expected_answer).correct,true,p.template_id+' authored key acceptance');
    if(p.grading_method==='multiple_choice')for(const choice of p.options)assert.equal(gradeProblem(p,choice.id).correct,choice.id===p.expected_answer,p.template_id);
    else {
     const parts=p.expected_answer.split('/').map(Number);
     const value=parts.length===2?parts[0]/parts[1]:Number(p.expected_answer);
     if(Number.isFinite(value))assert.equal(gradeProblem(p,String(value+1)).correct,false,p.template_id+' adjacent wrong value');
     assert.equal(gradeProblem(p,'not a mathematical answer').correct,false,p.template_id+' malformed answer');
    }
    if(p.diagram){assert.doesNotMatch(JSON.stringify(p.diagram),/\{[a-zA-Z_][a-zA-Z0-9_]*\}/);assert.ok(p.prompt.includes('y='));}
   }
  }
 }
});
test('new lesson drafts restore the exact original questions after template changes',()=>{
 for(const id of ids){
  const store=storeFor();store.createProfile('Foundation restoration');store.startTest(id,{force:true});
  const draft=store.snapshot().activeTest;store.updateResponse(draft.problems[0].template_id,{finalAnswer:'saved answer',work:'saved explanation'});
  const changed=structuredClone(curriculum);for(const t of changed.skills.find(s=>s.id===id).native_templates)t.prompt_template='Changed future template';
  const restored=storeFor(changed,store.exportSyncState());
  assert.deepEqual(restored.snapshot().activeTest.problems,draft.problems,id);
  assert.equal(restored.snapshot().activeTest.responses[draft.problems[0].template_id].finalAnswer,'saved answer',id);
  assert.equal(restored.snapshot().activeTest.responses[draft.problems[0].template_id].work,'saved explanation',id);
 }
});
test('new lesson capstones require external review even after correct ordinary answers',()=>{
 for(const id of ids){
  const store=storeFor();store.createProfile('Review boundary');store.startTest(id,{force:true});
  const draft=store.snapshot().activeTest,cap=draft.problems.find(p=>p.review_policy.mastery_requires_review_pass);
  for(const p of draft.problems)store.updateResponse(p.template_id,{finalAnswer:p.expected_answer,work:'A written explanation is present, but has not been reviewed.'});
  assert.equal(store.submitTest().ok,true,id);const attempt=store.saveReflection({confidenceRating:5,guessed:'no'});
  assert.equal(attempt.hasPendingReview,true,id);assert.notEqual(store.statusForSkill(id),'proven',id);
  assert.throws(()=>store.recordTutorFeedback({questionId:cap.template_id,reviewerType:'self',feedback:'I checked.',nextStep:'Continue.'}),/tutor review/);
 }
});
test('native Studio copies preserve new lesson visuals, mathematical displays and capstones',()=>{
 const store=storeFor();store.createProfile('Foundation author');
 for(const id of ids){
  const studio=createLessonStudio({store,getSnapshot:()=>store.snapshot(),download(){},showToast(){},openFilePicker(){}});
  studio.loadNativeLesson(id,{announce:false});const pack=studio.buildPack();const s=pack.skills[0];
  assert.equal(s.id,id);assert.equal(s.examples.length,10);assert.ok(s.media.length);
  assert.ok(s.problems.some(p=>p.review_policy.mastery_requires_review_pass));
  const original=curriculum.skills.find(s=>s.id===id);
  assert.deepEqual(s.examples.map(e=>e.math_blocks??[]),original.examples.map(e=>e.math_blocks??[]));
 }
});
test('foundation illustrations are verified embedded assets under the native budget',async()=>{
 const paths=new Set(additions.flatMap(s=>[s,...s.examples,...s.applications,...s.problems].flatMap(r=>(r.media??[]).map(m=>{assert.ok(m.alt && m.caption && m.width && m.height);return m.src;}))));
 assert.ok(paths.size>=20);assert.ok(curriculum.assets.reduce((n,a)=>n+a.bytes,0)<=1_000_000);
 for(const path of paths){
  const a=curriculum.assets.find(a=>a.path===path);assert.ok(a,path);
  const source=readFileSync(new URL('../content/math/algebra_foundations/skills/'+path,import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),a.sha256);assert.equal(source.length,a.bytes);
  assert.doesNotMatch(source.toString(),/<script|<foreignObject/i);
  const bytes=await loadLessonAsset(a,'',{fetchImpl(){throw Error('Unexpected network');}});assert.deepEqual(Buffer.from(bytes),source);
 }
});


test('real-root and tolerance syntax preserves signs, complete solution sets and excluded endpoints',()=>{
 const store=storeFor();
 const cases=[
  ['MATH_ALG_010','ALG010_SCALED_EQUATION','{-1,7}','7'],
  ['MATH_ALG_010','ALG010_CAPSTONE','[8,12]','(8,12)'],
  ['MATH_RAD_002','RAD002_ODD_RATIONAL_NEGATIVE','4','-4'],
  ['MATH_RAD_002','RAD002_FOURTH_EQUATION','{-2,2}','2'],
  ['MATH_RAD_002','RAD002_ODD_EQUATION','{-2}','{2}'],
  ['MATH_RAD_002','RAD002_RECIPROCAL_EVEN_DOMAIN','(2,inf)','[2,inf)'],
  ['MATH_RAD_002','RAD002_RECIPROCAL_ODD_DOMAIN','(-inf,2) U (2,inf)','(-inf,inf)'],
 ];
 for(const [id,template,correct,wrong] of cases){
  const p=store.previewNativeAssessment(id,17).problems.find(p=>p.source_template_id===template);
  assert.ok(p,template);assert.equal(gradeProblem(p,correct).correct,true,template);
  assert.equal(gradeProblem(p,wrong).correct,false,template);
 }
});
