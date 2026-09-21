/** Batch 6 application regressions. Synthetic in-memory learners only.
 * These tests do not manufacture Lean certificates or claim kernel verification.
 * QM_CURRICULUM is an explicit author-review override; CI uses the canonical export.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createQuickMathsStore,gradeProblem,normalizeFormalJob,normalizeFormalProofSpec,validateProceduralWork,STORAGE_KEY} from './challenge-core.js';
import {formalProblemBinding} from './formal-binding.js';
import {normalizeMathBlocks,renderMathBlocks} from './math-display.js';
import {normalizeCartesianDiagram,renderCartesianDiagram,graphExpression} from './cartesian-diagrams.js';
import {assertFormalMethod} from './formal-method-policy.js';
const data=JSON.parse(readFileSync(process.env.QM_CURRICULUM??new URL('./curriculum-data.json',import.meta.url),'utf8'));
const ids=['MATH_CALC_003','MATH_CALC_004','MATH_CALC_005','MATH_CALC_006'];
const additions=data.skills.filter(s=>ids.includes(s.id));
function storeFor(curriculum=data,initial=null){
 const mem=new Map(initial?[[STORAGE_KEY,typeof initial==='string'?initial:JSON.stringify(initial)]]:[]);
 return createQuickMathsStore({curriculum,storage:{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v))},now:()=>new Date('2026-09-21T16:00:00Z')});
}
const vals=p=>Object.fromEntries(Object.entries(p.values??{}).map(([k,v])=>[k,Number(v)]));
// Independent differentiation rules and interpretation keys, never p.expected_answer.
const answers={
 D6_DEF_SECANT:v=>(v.b*v.b-v.a*v.a)/(v.b-v.a), D6_DEF_QUOTIENT:()=> '6+h',
 D6_DEF_SQUARE_AT:v=>2*v.a,D6_DEF_CUBE_AT:v=>3*v.a*v.a,D6_DEF_AFFINE:v=>v.m,D6_DEF_CONSTANT:()=>0,
 D6_DEF_TANGENT:v=>`${2*v.a}*(x-(${v.a}))+${v.a*v.a}`,D6_DEF_MOTION:v=>2*v.k*v.a,
 D6_DEF_ABS_LEFT:()=>-1,D6_DEF_ABS_RIGHT:()=>1,D6_DEF_ABS_EXISTENCE:()=> 'B',
 D6_DEF_ROOT_AT4:()=> '1/4',D6_DEF_RECIPROCAL:v=>`-1/${v.a*v.a}`,D6_DEF_CHANGED_VALUE:()=> 'C',
 D6_DEF_UNITS:()=> 'D',D6_DEF_LOCAL_LINEAR:v=>v.v+v.m*(v.target-v.a),
 D6_DEF_TABLE_EVIDENCE:()=> 'A',D6_DEF_TANGENT_CROSSING:()=> 'B',D6_DEF_VALUE_VS_RATE:()=> 'C',D6_DEF_REVIEW:()=>-4,
 D6_RULE_CONSTANT:()=>0,D6_RULE_MONOMIAL:v=>`${v.c*v.n}*x^${v.n-1}`,
 D6_RULE_QUADRATIC:v=>`${2*v.a}*x+(${v.b})`,D6_RULE_CUBIC_AT:v=>3*v.a*v.r*v.r+2*v.b*v.r+v.c,
 D6_RULE_NEGATIVE_SIGN:()=> 'A',D6_RULE_FRACTION:v=>`${3*v.r*v.r}/${v.d}`,
 D6_RULE_SUM_DATA:v=>v.u+v.v,D6_RULE_LINEAR_COMBINATION:v=>v.p*v.u-v.q*v.v,
 D6_RULE_EXPAND_SQUARE:v=>`2*(x+(${v.b}))`,D6_RULE_LINEAR_TERM:v=>v.m,
 D6_RULE_PARAMETER:v=>v.target/12,D6_RULE_STATIONARY_INPUT:v=>v.a,
 D6_RULE_ZERO_AT_POINT:()=> 'B',D6_RULE_VERTICAL_SHIFT:()=> 'C',D6_RULE_EXPONENT_ERROR:()=> 'D',D6_RULE_CONSTANT_PARAMETER:()=> 'A',
 D6_RULE_GRAPH_SLOPE:v=>2*(v.a-2),D6_RULE_EVALUATE_ORDER:()=> 'B',D6_RULE_UNITS:()=> 'C',D6_RULE_REVIEW:()=>12,
 D6_PQ_TWO_LINES:v=>`(x+(${v.a}))+(x+(${v.b}))`,D6_PQ_SQUARE_LINE:v=>`2*x*(${v.a}*x+(${v.b}))+${v.a}*x^2`,
 D6_PQ_PRODUCT_DATA:v=>v.du*v.v+v.u*v.dv,D6_PQ_PRODUCT_AT:v=>3*v.a*v.a+v.b,
 D6_PQ_X_OVER_LINE:v=>`${v.b}/(x+${v.b})^2`,D6_PQ_QUOTIENT_DATA:v=>`(${v.du*v.v-v.u*v.dv})/${v.v*v.v}`,
 D6_PQ_SQUARE_OVER_LINE:v=>`(2*x*(x+${v.b})-x^2)/(x+${v.b})^2`,D6_PQ_RECIPROCAL:v=>`-(${v.c})/(x-(${v.a}))^2`,
 D6_PQ_AT_ONE:v=>`(${3-v.k})/4`,D6_PQ_SUBTRACTION_ORDER:()=> 'D',D6_PQ_HOLE_AT:()=> 'A',D6_PQ_HOLE_AWAY:()=>1,
 D6_PQ_PRODUCT_ERROR:()=> 'B',D6_PQ_DOMAIN:()=> 'C',D6_PQ_AREA_RATE:v=>v.dl*v.w+v.l*v.dw,
 D6_PQ_AVERAGE_COST:v=>`(${v.r*v.r-v.k})/${v.r*v.r}`,D6_PQ_RATE_UNITS:()=> 'D',D6_PQ_SIMPLER_METHOD:()=> 'A',D6_PQ_COMPONENT_HYPOTHESIS:()=> 'B',D6_PQ_REVIEW:()=>1,
 D6_CHAIN_AFFINE_POWER:v=>`${v.n}*(${v.a}*x+(${v.b}))^${v.n-1}*(${v.a})`,D6_CHAIN_QUADRATIC_CUBE:v=>`3*(x^2+${v.b})^2*(2*x)`,
 D6_CHAIN_RECIPROCAL:v=>`-(${v.a})/(${v.a}*x+(${v.b}))^2`,D6_CHAIN_ROOT_AT:v=>`${v.a}/(2*sqrt(${v.a*v.p+v.b}))`,
 D6_CHAIN_NESTED_AT:v=>2*(v.a**3+v.b)*3*v.a*v.a,D6_CHAIN_MATCHED_DATA:v=>v.u*v.v,D6_CHAIN_WRONG_INPUT:()=> 'C',
 D6_CHAIN_THREE_LAYERS:v=>`2*((${v.a}*x+1)^2+${v.b})*2*(${v.a}*x+1)*${v.a}`,
 D6_CHAIN_PRODUCT:v=>`(${v.a}*x+(${v.b}))^3+x*3*(${v.a}*x+(${v.b}))^2*${v.a}`,
 D6_CHAIN_QUOTIENT:v=>`(2*x*(x^2+${v.b})^2-(x^2+1)*2*(x^2+${v.b})*2*x)/(x^2+${v.b})^4`,
 D6_CHAIN_ROOT_FORMULA:v=>`2*x/(2*sqrt(x^2+${v.b}))`,D6_CHAIN_RATE_UNITS:()=> 'D',D6_CHAIN_DOUBLE_ROOT_AT:()=> '3/2',
 D6_CHAIN_ROOT_DOMAIN:()=> 'A',D6_CHAIN_ZERO_INNER:()=> 'B',D6_CHAIN_ROOT_GRAPH:()=> '1/4',D6_CHAIN_MISSING_INNER:()=> 'C',
 D6_CHAIN_SUM_COMPOSITE:v=>`3*(2*x+${v.b})^2*2+2*x`,D6_CHAIN_OUTERMOST:()=> 'D',D6_CHAIN_REVIEW:()=> '3/4',
};
const oracle=p=>String(answers[p.source_template_id](vals(p)));
function exclusions(p){const v=vals(p);return ({D6_PQ_X_OVER_LINE:[-v.b],D6_PQ_SQUARE_OVER_LINE:[-v.b],D6_PQ_RECIPROCAL:[v.a],D6_CHAIN_RECIPROCAL:[`-(${v.b})/(${v.a})`]})[p.source_template_id]??[];}
const work=p=>p.work_required?'Synthetic review lifecycle fixture; actual mathematics is checked separately.':'';
function respond(store,p){store.updateResponse(p.template_id,{finalAnswer:p.proof_spec?p.expected_answer:oracle(p),work:work(p),structuredWorkJson:p.grading_method==='rational_expression'?{excluded_values:exclusions(p)}:null});}

 test('Batch 6 has four complete lessons and preserves a separate ordinary capstone and formal requirement',()=>{
 assert.equal(additions.length,4);assert.equal(Object.keys(answers).length,80);
 const known=new Set(data.skills.map(s=>s.id)),active=new Set(),done=new Set();
 function visit(id){assert.ok(!active.has(id),'cycle '+id);if(done.has(id))return;active.add(id);const s=data.skills.find(s=>s.id===id);assert.ok(s);for(const p of s.prerequisites){const pid=typeof p==='string'?p:p.skillId??p.skill_id;assert.ok(known.has(pid));visit(pid);}active.delete(id);done.add(id);}
 for(const s of additions){visit(s.id);assert.equal(s.subdomain,'Calculus');assert.equal(s.examples.length,10);assert.equal(s.applications.length,4);assert.ok(s.theory.split(/\s+/).length>=750);assert.equal(s.question_count,21);assert.equal(s.native_templates.length,21);assert.equal(s.native_templates.filter(q=>!q.proof_spec).length,20);assert.equal(s.native_templates.filter(q=>q.proof_spec).length,1);assert.equal(s.native_templates.filter(q=>q.review_policy.mastery_requires_review_pass).length,1);assert.equal(new Set(s.problems.map(p=>p.source_template_id)).size,21);assert.doesNotThrow(()=>normalizeMathBlocks(s.math_blocks));assert.ok(renderMathBlocks(s.math_blocks).length);}
 });

 test('8,400 instances retain every scenario, independent answers, mandatory work, and exact formal bindings',()=>{
 const store=storeFor(),diversity=new Map();
 for(let v=0;v<100;v++)for(const s of additions){
 const ps=store.previewNativeAssessment(s.id,v).problems;assert.equal(ps.length,21);assert.equal(new Set(ps.map(p=>p.source_template_id)).size,21);
 assert.equal(ps.filter(p=>p.review_policy.mastery_requires_review_pass).length,1);assert.equal(ps.filter(p=>p.proof_spec).length,1);
 for(const p of ps){assert.match(p.template_id,/__RUNTIME_/);assert.doesNotMatch(p.prompt,/\{[A-Za-z_][A-Za-z0-9_]*\}/);assert.ok(p.solution_steps.length);
 if(p.proof_spec){assert.equal(p.formal_job.problem_binding_sha256,formalProblemBinding(p));assert.doesNotThrow(()=>normalizeFormalJob(p.formal_job,p.proof_spec,p.template_id,formalProblemBinding(p)));assert.equal(gradeProblem(p,p.expected_answer).correct,false);continue;}
 const a=oracle(p),sw=p.grading_method==='rational_expression'?{excluded_values:exclusions(p)}:null;
 assert.equal(gradeProblem(p,a,sw).correct,true,`${v} ${p.source_template_id}: ${a}`);
 assert.equal(gradeProblem(p,p.expected_answer,sw).correct,true,`${p.source_template_id} authored key`);
 if(p.grading_method==='multiple_choice')for(const op of p.options)assert.equal(gradeProblem(p,op.id).correct,op.id===a);
 else assert.equal(gradeProblem(p,`(${a})+1`,sw).correct,false,`${p.source_template_id} false near-answer`);
 if(p.work_required)assert.notEqual(validateProceduralWork(p,''),null,`${p.source_template_id} missing work`);
 if(p.grading_method==='rational_expression'){assert.equal(gradeProblem(p,a,{excluded_values:[]}).correct,false);assert.equal(gradeProblem(p,a,{excluded_values:[...exclusions(p),'12345']}).correct,false);}
 if(!diversity.has(p.source_template_id))diversity.set(p.source_template_id,new Set());diversity.get(p.source_template_id).add(p.prompt);
 }
 }
 for(const s of additions)for(const q of s.native_templates.filter(q=>q.type==='generated'))assert.ok(diversity.get(q.id).size>=3,q.id);
 });

 test('diagrams and math blocks resolve only public parameters, with correct negative-coordinate squares',()=>{
 const store=storeFor();let count=0;
 for(const s of additions)for(const q of s.native_templates){const shown=new Set([...q.prompt_template.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(m=>m[1]));for(const m of JSON.stringify([q.diagram??{},q.math_blocks??[]]).matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g))assert.ok(shown.has(m[1]),q.id+' hidden '+m[1]);}
 for(let v=0;v<100;v++)for(const s of additions)for(const p of store.previewNativeAssessment(s.id,v).problems){
 if(p.math_blocks){assert.doesNotThrow(()=>normalizeMathBlocks(p.math_blocks));assert.ok(renderMathBlocks(p.math_blocks));}
 if(!p.diagram)continue;count++;const d=normalizeCartesianDiagram(p.diagram),n=vals(p);assert.ok(renderCartesianDiagram(d).includes('<svg'));
 if(p.source_template_id==='D6_DEF_SECANT'){assert.deepEqual(d.segments[0].from,[n.a,n.a*n.a]);assert.deepEqual(d.segments[0].to,[n.b,n.b*n.b]);}
 if(p.source_template_id==='D6_RULE_MONOMIAL')for(const x of d.x_range){const y=n.c*x**n.n;assert.ok(y>=d.y_range[0]&&y<=d.y_range[1]);}
 if(p.source_template_id==='D6_RULE_GRAPH_SLOPE')assert.deepEqual(d.points[0].at,[n.a,n.a*n.a-4*n.a+1]);
 if(p.source_template_id==='D6_CHAIN_ROOT_AT'){assert.ok(Math.abs(d.x_range[0]+n.b/n.a)<1e-10);assert.ok(n.a*n.p+n.b>0);assert.ok(Math.sqrt(n.a*d.x_range[1]+n.b)<=d.y_range[1]);}
 if(p.source_template_id==='D6_DEF_CHANGED_VALUE'){assert.deepEqual(d.curves[0].exclude,[1]);assert.equal(d.points[0].endpoint,'open');assert.equal(d.points[1].endpoint,'closed');}
 }
 assert.equal(count,1200);
 });

 test('plausible calculus misconceptions are rejected, not just arbitrary wrong numbers',()=>{
 const store=storeFor(),ps=additions.flatMap(s=>store.previewNativeAssessment(s.id,0).problems),get=id=>ps.find(p=>p.source_template_id===id);
 for(const [id,a] of [['D6_DEF_QUOTIENT','h+3'],['D6_DEF_ROOT_AT4','-1/4'],['D6_DEF_REVIEW','4'],['D6_RULE_REVIEW','0'],['D6_PQ_REVIEW','0'],['D6_CHAIN_DOUBLE_ROOT_AT','3'],['D6_CHAIN_REVIEW','1/4']])assert.equal(gradeProblem(get(id),a).correct,false,id);
 let p=get('D6_PQ_QUOTIENT_DATA'),v=vals(p);if(v.du*v.v-v.u*v.dv!==0)assert.equal(gradeProblem(p,`${v.u*v.dv-v.du*v.v}/${v.v*v.v}`).correct,false);
 p=get('D6_CHAIN_AFFINE_POWER');v=vals(p);assert.notEqual(v.a,1);assert.equal(gradeProblem(p,`${v.n}*(${v.a}*x+(${v.b}))^${v.n-1}`).correct,false);
 p=get('D6_PQ_X_OVER_LINE');assert.equal(gradeProblem(p,oracle(p),{excluded_values:[]}).correct,false);
 });

 test('the derivative-definition capstone rejects a valid shortcut method structurally',()=>{
 const p=additions[0].native_templates.find(p=>p.proof_spec);assert.equal(p.proof_spec.assessment_policy.required_method,'derivative_definition');assert.deepEqual(p.proof_spec.allowed_rules,['rational_hole_limit','derivative_from_limit']);
 const goal={kind:'derivative',variable:'x',expression:{kind:'pow',base:{kind:'var',id:'x'},exponent:2},point:{kind:'int',value:3},result:{kind:'int',value:6}};
 const request={goal,steps:[{id:'answer',scope:'root',claim:goal,rule:'polynomial_derivative',premises:[]}]};
 assert.throws(()=>assertFormalMethod(p.proof_spec.assessment_policy,request),/derivative_from_limit/);
 request.steps[0].rule='derivative_from_limit';assert.doesNotThrow(()=>assertFormalMethod(p.proof_spec.assessment_policy,request));
 // This last assertion is only a method-policy check. No mathematical certificate is created.
 });

 test('the full assessment cannot submit an answer phrase instead of a verified learner proof',()=>{
 for(const s of additions){const store=storeFor();store.createProfile('Synthetic full assessment');store.setLearningPreferences({progressionMode:'soft'});const d=store.startTest(s.id);d.problems.forEach(p=>respond(store,p));assert.equal(store.submitTest().ok,false);assert.equal(JSON.parse(store.exportSyncState()).attempts.length,0);}
 });

 test('ordinary-only lifecycle fixture requires a permitted rubric review even with all answer keys correct',()=>{
 const fixture=structuredClone(data);for(const s of fixture.skills.filter(s=>ids.includes(s.id))){s.native_templates=s.native_templates.filter(q=>!q.proof_spec);s.problems=s.problems.filter(p=>!p.proof_spec);s.question_count=20;}
 for(const s of additions){const store=storeFor(fixture);store.createProfile('Synthetic ordinary review');store.setLearningPreferences({progressionMode:'soft'});const d=store.startTest(s.id),cap=d.problems.find(p=>p.review_policy.mastery_requires_review_pass);d.problems.forEach(p=>respond(store,p));assert.equal(store.submitTest().ok,true);const result=store.saveReflection({confidenceRating:4,guessed:'no'});assert.equal(result.percentScore,1);assert.equal(store.statusForSkill(s.id),'learning');assert.equal(result.hasPendingReview,true);
 assert.throws(()=>store.recordTutorFeedback({questionId:cap.template_id,reviewerType:'self',feedback:'Self check.',nextStep:'Continue.'}),/tutor review/);
 const guide=store.inspectStudentWork({questionId:cap.template_id}).review_guide;
 const review=store.recordTutorFeedback({questionId:cap.template_id,reviewerType:'human_tutor',feedback:'Synthetic authorized review contract, not a real learner evaluation.',nextStep:'Continue.',rubricResults:guide.rubric_criteria.map(c=>({id:c.id,awardedPoints:c.weight,note:'Synthetic review contract.'}))});assert.equal(review.verdict,'pass');assert.equal(store.statusForSkill(s.id),'proven');
 }
 });

 test('saved retakes keep exact questions, diagrams, answers and work when current templates change',()=>{
 for(const s of additions){let store=storeFor();const profile=store.createProfile('Synthetic saved retake');store.setLearningPreferences({progressionMode:'soft'});let saved=JSON.parse(store.exportSyncState());saved.progress[profile.id][s.id]={attemptCount:3};store=storeFor(data,saved);const d=store.startTest(s.id);d.problems.forEach(p=>store.updateResponse(p.template_id,{finalAnswer:'saved answer',work:'original reasoning '+p.template_id}));saved=JSON.parse(store.exportSyncState());
 const altered=structuredClone(data),target=altered.skills.find(x=>x.id===s.id);target.question_count=1;target.native_templates.reverse();for(const q of target.native_templates){if(q.variables?.a?.type==='int'){q.variables.a.min=20;q.variables.a.max=21;}}
 const restored=storeFor(altered,saved),next=JSON.parse(restored.exportSyncState());assert.deepEqual(next.drafts,saved.drafts);assert.equal(restored.snapshot().activeTest.problems.length,21);
 const backup=store.exportBackup(),imported=storeFor(altered);imported.importBackup(backup);assert.deepEqual(JSON.parse(imported.exportSyncState()).drafts,saved.drafts);
 }
 });

 test('all eight offline figures have valid byte hashes and meaningful accessible descriptions',()=>{
 const seen=new Set();for(const s of additions)for(const m of s.media){seen.add(m.src);assert.ok(m.alt.length>40);assert.ok(m.caption.length>40);const a=data.assets.find(a=>a.path===m.src);assert.ok(a,m.src);const bytes=Buffer.from(a.data_base64,'base64');assert.equal(bytes.length,a.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);const text=bytes.toString('utf8');assert.ok(text.includes('<svg'));assert.ok(!/<script\b/i.test(text));}
 assert.equal(seen.size,8);
 });

 test('Studio counts only a selected native lesson\'s media, not the entire growing catalog',async()=>{
 const {createLessonStudio}=await import('./lesson-creator.js');
 const {lessonIllustrations}=await import('./lesson-illustrations.js?v=20260908-statistics-v1');
 const {normalizeLessonAssets}=await import('./lesson-media.js');
 const large=structuredClone(data),asset=large.assets[0];
 for(let i=0;i<80;i++)large.assets.push({...structuredClone(asset),path:`media/unreferenced-batch6-test-${i}.svg`});
 const before=JSON.stringify(large.assets),store=storeFor(large);store.createProfile('Synthetic media author');
 const studio=createLessonStudio({store,getSnapshot:()=>store.snapshot(),download(){},showToast(){},openFilePicker(){}});
 for(const id of ['MATH_TRIG_001',...ids]){
  const skill=large.skills.find(s=>s.id===id);studio.loadNativeLesson(id,{announce:false});const pack=studio.buildPack();
  const sections=[skill,...skill.examples,...skill.applications,...skill.problems];
  const expected=new Set([...sections.flatMap(s=>s.media??[]),...(lessonIllustrations(skill)?.media??[])].flatMap(m=>[m.src,...(m.sources??[]),m.poster]).filter(Boolean));
  assert.deepEqual(new Set(pack.assets.map(a=>a.path)),expected,id);assert.equal(store.previewLessonPack(pack).mode,'override');
  assert.ok(!pack.assets.some(a=>a.path.includes('unreferenced-batch6-test')));
 }
 assert.equal(JSON.stringify(large.assets),before);
 assert.throws(()=>normalizeLessonAssets(Array.from({length:61},(_,i)=>({...asset,path:`media/import-limit-test-${i}.svg`}))),/at most 60/);
 });
