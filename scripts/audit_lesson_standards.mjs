import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeLessonPack,gradeProblem} from '../docs/challenge-core.js';
import {lessonIllustrations} from '../docs/lesson-illustrations.js';
import {lessonClassification} from '../docs/learning-fields.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const native=read('docs/curriculum-data.json');
const sources=[{name:'Native Mathematics',path:'docs/curriculum-data.json',skills:native.skills,field:'SUBJECT_MATH'}];
const depot='docs/lesson-depot/lessons';
for(const slug of readdirSync(resolve(root,depot),{withFileTypes:true}).filter(d=>d.isDirectory())) {
 for(const version of readdirSync(resolve(root,depot,slug.name),{withFileTypes:true}).filter(d=>d.isDirectory())) {
  const path=`${depot}/${slug.name}/${version.name}/lesson-set.json`;
  const raw=read(path);
  normalizeLessonPack(raw,{nativeSkills:native.skills,knownSkillIds:native.skills.map(s=>s.id),allowMissingReferences:true});
  sources.push({name:raw.name,path,skills:raw.skills,field:raw.subject?.id});
 }
}
const updated=new Set(['MATH_FUNC_004','MATH_FUNC_007','MATH_RAD_001','MATH_SYS_001','MATH_CALC_001','MATH_CALC_002']);
const rows=[];
for(const source of sources)for(const skill of source.skills){
 const questions=skill.native_templates?.length?skill.native_templates:skill.problems??[];
 const formal=questions.filter(q=>q.proof_spec);
 const reviewed=questions.filter(q=>q.review_policy?.mastery_requires_review_pass || ['proof_obligations','rubric_check','limit_steps'].includes(q.work?.mode));
 const media=[skill,...skill.examples??[],...skill.applications??[]].reduce((n,x)=>n+(x.media?.length??0),0)+(lessonIllustrations(skill)?.media.length??0);
 const row={id:skill.id,name:skill.name,source:source.path,field:source.field,...lessonClassification(skill,source.field),questions:questions.length,assessment_length:skill.question_count,formal_questions:formal.length,review_gates:reviewed.length,illustrations:media,
 disposition:updated.has(skill.id)?'Added supported Lean exercise':formal.length?'Retain existing Lean exercise':source.field==='SUBJECT_PROGRAMMING'?'Retain code/trace assessment':reviewed.length?'Retain explicit reasoning review':'Retain ordinary assessment'};
 if(!skill.theory?.trim() || !questions.length)throw Error(`${skill.id}: missing teaching or questions`);
 for(const p of (skill.problems??[]).filter(q=>q.proof_spec))if(gradeProblem(p,String(p.expected_answer)).correct)throw Error(`${skill.id}: formal string earned credit`);
 rows.push(row);
}
const summary={lesson_count:rows.length,native_lessons:native.skills.length,formal_lessons:rows.filter(r=>r.formal_questions).length,without_illustrations:rows.filter(r=>!r.illustrations).map(r=>r.id),sources:sources.map(s=>({name:s.name,path:s.path,lessons:s.skills.length})),lessons:rows};
const destination=process.argv[2]??'docs/releases/2026-09-21-lesson-standard-inventory.json';
writeFileSync(resolve(root,destination),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({lessons:rows.length,formal_lessons:summary.formal_lessons,without_illustrations:summary.without_illustrations,sources:summary.sources}));
