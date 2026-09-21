"""Source/export contracts for the twenty new foundation lessons."""
import json
from pathlib import Path
import yaml
from quickmaths.content_loader import load_skill_file
from quickmaths.problem_generator import generate_test
ROOT=Path(__file__).resolve().parents[1]
IDS=json.loads((ROOT/'docs/test-support/foundations-roadmap.json').read_text())['lesson_ids']
def test_new_sources_export_without_losing_teaching_or_review():
 exported=json.loads((ROOT/'docs/curriculum-data.json').read_text(encoding='utf-8'))
 by_id={s['id']:s for s in exported['skills']}
 assert len(by_id)==112
 for id in IDS:
  paths=list((ROOT/'content/math/algebra_foundations/skills').glob(id+'_*.yaml'))
  assert len(paths)==1,id
  source=yaml.safe_load(paths[0].read_text(encoding='utf-8'));out=by_id[id]
  for key in ['name','theory','examples','applications','prerequisites','media']:
   assert source[key]==out[key],(id,key)
  assert source['test']['question_count']==out['question_count']==20
  assert {q['id'] for q in source['test']['questions']}=={q['id'] for q in out['native_templates']}
  expected={q['id']:q for q in source['test']['questions']}
  for q in out['native_templates']:
   original=expected[q['id']]
   assert q['prompt_template']==original.get('prompt_template',original.get('prompt',''))
   for key in ['answer','grading','work','review_policy']:
    assert q[key]==original.get(key,{}),(id,q['id'],key)
   for choice in original.get('options',[]):
    assert set(choice)=={'id','label'} and isinstance(choice['label'],str),(id,q['id'],choice)
def test_existing_prerequisite_locks_are_unchanged():
 baseline=json.loads((ROOT/'docs/test-support/pre-foundations-prerequisites.json').read_text())
 curriculum=json.loads((ROOT/'docs/curriculum-data.json').read_text(encoding='utf-8'))
 for s in curriculum['skills']:
  if s['id'] in baseline:assert s['prerequisites']==baseline[s['id']],s['id']
def test_native_python_retakes_keep_all_scenarios_and_the_reviewed_capstone():
 for id in IDS:
  skill=load_skill_file(next((ROOT/'content/math/algebra_foundations/skills').glob(id+'_*.yaml')))
  keys={q.id for q in skill.test.questions}
  for seed in range(100):
   questions=generate_test(skill,seed)
   assert len(questions)==20 and {q.template_id for q in questions}==keys,(id,seed)
   caps=[q for q in questions if q.review_policy.get('mastery_requires_review_pass')]
   assert len(caps)==1 and caps[0].review_policy['allow_self_review'] is False,(id,seed)
