import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeCartesianDiagram, resolveCartesianDiagram, publicDiagramValues, cartesianSegments, graphExpression, renderCartesianDiagram} from './cartesian-diagrams.js';
import {createQuickMathsStore, STORAGE_KEY} from './challenge-core.js';
import {createLessonStudio} from './lesson-creator.js';
const base={kind:'cartesian',x_range:[-5,5],y_range:[-5,12],alt:'Graph of the stated function.',curves:[]};
export const fixtures=[
 {...base,alt:'Quadratic with marked secant endpoints.',curves:[{expression:'x**2',interval:[-3,3]}],segments:[{from:[1,1],to:[2,4]}]},
 {...base,alt:'Piecewise jump. Open endpoint at (0,1); separate filled value (0,3).',curves:[{expression:'1',interval:[-4,0],endpoints:['none','open']},{expression:'2',interval:[0,4],endpoints:['open','none']}],points:[{at:[0,3]}]},
 {...base,alt:'Rational curve with a hole at (3,6).',curves:[{expression:'(x**2-9)/(x-3)',interval:[-4,5],exclude:[3]}],points:[{at:[3,6],endpoint:'open'}]},
 {...base,alt:'Square root restricted to [1,5].',curves:[{expression:'sqrt(x-1)',interval:[1,5],endpoints:['closed','closed']}]},
];
test('bounded Cartesian fixtures preserve endpoint inclusion, holes and poles',()=>{
 for(const f of fixtures) {const s=normalizeCartesianDiagram(f);assert.deepEqual(normalizeCartesianDiagram(s),s);assert.match(renderCartesianDiagram(s),/tabindex="0"/);}
 const c=normalizeCartesianDiagram({...base,curves:[{expression:'1/(x-0.123)',interval:[-5,5]}]}).curves[0];
 for(const path of cartesianSegments(c,[-5,5],[-1000,1000])) assert.ok(!path.some(p=>p[0]<.123)||!path.some(p=>p[0]>.123),'never bridge a pole between samples');
 const hole=normalizeCartesianDiagram(fixtures[2]);for(const path of cartesianSegments(hole.curves[0],hole.x_range,hole.y_range))assert.ok(!path.some(p=>p[0]<3)||!path.some(p=>p[0]>3));
 assert.equal(graphExpression('sqrt(x-1)')(0),null);
 for(const expression of ['fetch(1)','x.constructor','x**999','__proto__','<script>','sin(x)','1;alert(1)'])assert.throws(()=>graphExpression(expression));
 assert.throws(()=>normalizeCartesianDiagram({...base,html:'unsafe'}));
});
const math=[{type:'fraction',numerator:'f(x+h)-f(x)',denominator:'h',alt:'Difference quotient for h not zero.',linear_text:'(f(x+h)-f(x))/h, h != 0'}];
const makeCurriculum=()=>{
 const c=JSON.parse(readFileSync(new URL('./curriculum-data.json',import.meta.url)));
 const skill=c.skills.find(s=>s.id==='MATH_ARITH_001');skill.prerequisites=[];skill.question_count=1;skill.native_randomize_order=false;
 skill.math_blocks=math;skill.examples[0].math_blocks=math;
 skill.native_templates=[{id:'CARTESIAN_Q',type:'generated',prompt_template:'For f(x)=x**2, use the secant endpoints a={a}, b={b}.',variables:{a:{type:'int',min:1,max:2},b:{type:'int',min:3,max:4}},answer:{type:'numeric',value:'{a+b}'},grading:{method:'exact_numeric'},explanation_template:'First line\nSecond line\nThird line\nFourth line',math_blocks:math,diagram:{...base,alt:'Secant inputs {a} and {b}.',segments:[{from:['{a}','({a})**2'],to:['{b}','({b})**2']}],curves:[{expression:'x**2',interval:[-3,3]}],labels:[{at:['{a}',0],text:'a={a}'},{at:['{b}',0],text:'b={b}'}]}}];
 return c;
};
const storeFor=(c,initial=null)=>createQuickMathsStore({curriculum:c,storage:{getItem:k=>k===STORAGE_KEY?initial:null,setItem(){}}});
test('100 variants resolve visuals atomically from public givens only',()=>{
 const c=makeCurriculum(),store=storeFor(c);
 for(let seed=0;seed<100;seed++){
  const p=store.previewNativeAssessment('MATH_ARITH_001',seed).problems[0];
  assert.equal(p.solution_steps.length,4);assert.deepEqual(p.diagram.segments[0].from,[Number(p.values.a),Number(p.values.a)**2]);assert.equal(p.diagram.labels[0].at[0],Number(p.values.a));assert.equal(p.diagram.labels[1].text,`b=${p.values.b}`);assert.match(p.prompt,new RegExp(`a=${p.values.a}`));
 }
 assert.deepEqual(publicDiagramValues('Given {a}.',{a:2,secret:99}),{a:2});
 assert.throws(()=>resolveCartesianDiagram({...base,alt:'Hidden {secret}'},{a:2}));
});
test('restore original draft after changing template defaults; Studio export and backups retain visuals',()=>{
 const c=makeCurriculum(),store=storeFor(c);store.createProfile('Visual QA');store.startTest('MATH_ARITH_001');
 const original=structuredClone(store.snapshot().activeTest.problems[0]);store.updateResponse(original.template_id,{finalAnswer:'4',work:''});
 const changed=structuredClone(c);changed.skills.find(s=>s.id==='MATH_ARITH_001').native_templates[0].variables.a={type:'int',min:50,max:50};
 const restored=storeFor(changed,store.exportSyncState());const p=restored.snapshot().activeTest.problems[0];assert.equal(p.prompt,original.prompt);assert.deepEqual(p.diagram,original.diagram);assert.deepEqual(p.math_blocks,math);
 // Portable Studio uses a resolved fixed problem, as native templates are trusted-only.
 const skill=c.skills.find(s=>s.id==='MATH_ARITH_001');skill.problems=[original];
 const author=storeFor(c);author.createProfile('Author');const studio=createLessonStudio({store:author,getSnapshot:()=>author.snapshot(),download(){},showToast(){},openFilePicker(){}});studio.loadNativeLesson(skill.id,{announce:false});
 const pack=studio.buildPack();assert.deepEqual(pack.skills[0].problems[0].diagram,original.diagram);assert.deepEqual(pack.skills[0].math_blocks,math);assert.deepEqual(pack.skills[0].examples[0].math_blocks,math);author.importLessonPack(pack);
 const backup=storeFor(c);backup.importBackup(author.exportBackup());assert.deepEqual(backup.skillsById[skill.id].problems[0].diagram,original.diagram);
});

test('saved attempts retain resolved displays and limit work cannot award automatic mastery',()=>{
 const c=makeCurriculum(),skill=c.skills.find(s=>s.id==='MATH_ARITH_001');
 skill.native_templates[0].work={mode:'limit_steps',limit:{variable:'x',approach:'3',direction:'both',original_expression:'(x**2-9)/(x-3)',restrictions:['x != 3']}};
 const store=storeFor(c);store.createProfile('Limit QA');store.startTest(skill.id);const p=store.snapshot().activeTest.problems[0];
 const limit={...p.work.limit,steps:['(x**2-9)/(x-3)','x+3'],result_kind:'finite',result_value:'6'};
 store.updateResponse(p.template_id,{finalAnswer:p.expected_answer,work:'',structuredWorkJson:{limit}});
 assert.equal(store.submitTest().ok,true);const attempt=store.saveReflection({confidenceRating:5,guessed:'no',wantsMorePractice:'no'});
 assert.equal(attempt.results[0].reviewRequired,true);assert.equal(attempt.results[0].allowSelfReview,false);
 assert.equal(store.snapshot().progressRows.find(r=>r.id===skill.id).status,'learning');
 const restored=storeFor(c,store.exportSyncState());const result=restored.getAttempt(attempt.attemptId).results[0];
 assert.deepEqual(result.diagram,p.diagram);assert.deepEqual(result.math_blocks,p.math_blocks);assert.deepEqual(result.structuredWorkJson.limit,limit);
});

test('Studio edits display data and preserves required limit review policy',()=>{
 const c=makeCurriculum(),store=storeFor(c);store.createProfile('Studio QA');const studio=createLessonStudio({store,getSnapshot:()=>store.snapshot(),download(){},showToast(){},openFilePicker(){}});studio.loadNativeLesson('MATH_ARITH_001',{announce:false});
 const edit=(field,value)=>studio.handleInput({value,type:'text',dataset:{creatorField:`problem.${field}`,index:'0'},matches:()=>false});
 edit('diagramJson',JSON.stringify(fixtures[1]));edit('mathBlocksJson',JSON.stringify(math));edit('workMode','limit_steps');edit('limitVariable','x');edit('limitApproach','3');edit('limitOriginal','(x**2-9)/(x-3)');edit('limitRestrictions','x != 3');
 const pack=studio.buildPack(),p=pack.skills[0].problems[0];assert.deepEqual(p.diagram,normalizeCartesianDiagram(fixtures[1]));assert.deepEqual(p.math_blocks,math);assert.equal(p.work.mode,'limit_steps');assert.deepEqual(p.review_policy,{work_review:'tutor_required',mastery_requires_review_pass:true,allow_self_review:false});store.previewLessonPack(pack);
 edit('diagramJson','{');assert.throws(()=>studio.buildPack());assert.doesNotThrow(()=>studio.render(store.snapshot()));
});
