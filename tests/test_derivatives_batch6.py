"""Source and independent mathematics for Batch 6; no certificate mocks.
The final test uses the actual native Python generator in a full repository.
"""
from __future__ import annotations
import json,re
from pathlib import Path
import pytest
import sympy as sp
import yaml

ROOT=Path(__file__).resolve().parents[1]
IDS=[f'MATH_CALC_{i:03d}' for i in range(3,7)]
SOURCE=ROOT/'content/math/algebra_foundations/skills'
ORACLES=json.loads((Path(__file__).parent/'fixtures/derivatives_batch6_oracles.json').read_text(encoding="utf-8"))

def lessons():
 result=[]
 for id in IDS:
  paths=list(SOURCE.glob(id+'_*.yaml'));assert len(paths)==1
  result.append(yaml.safe_load(paths[0].read_text(encoding="utf-8")))
 return result

@pytest.mark.parametrize('skill',lessons(),ids=IDS)
def test_complete_source_and_required_capstones(skill):
 assert len(skill['examples'])==10 and len(skill['applications'])==4
 assert len(skill['theory'].split())>=750
 qs=skill['test']['questions'];assert len(qs)==skill['test']['question_count']==21
 assert len({q['id'] for q in qs})==21
 assert sum(bool(q.get('proof_spec')) for q in qs)==1
 assert sum(bool(q['review_policy']['mastery_requires_review_pass']) for q in qs)==1
 assert {q['difficulty'] for q in qs}=={'easy','medium','hard'}
 cap=next(q for q in qs if q['review_policy']['mastery_requires_review_pass'])
 assert cap['work']['mode']=='rubric_check' and not cap['review_policy']['allow_self_review']
 assert cap['review_policy']['work_review']=='tutor_required'
 assert all(q['mistake_tags'] and q['explanation_template'] for q in qs)

@pytest.mark.parametrize('skill',lessons(),ids=IDS)
def test_visual_bindings_use_exact_public_prompt_names(skill):
 for q in skill['test']['questions']:
  public=set(re.findall(r'\{([A-Za-z_][A-Za-z0-9_]*)\}',q['prompt_template']))
  used=set(re.findall(r'\{([A-Za-z_][A-Za-z0-9_]*)\}',json.dumps([q.get('diagram'),q.get('math_blocks')])))
  assert used<=public
 for m in skill['media']:
  assert (SOURCE/m['src']).is_file() and m['alt'] and m['caption']
 assert skill['math_blocks']


def test_first_principles_reference_cites_the_limit_and_restricts_the_method():
 q=next(q for q in lessons()[0]['test']['questions'] if q.get('proof_spec'));spec=q['proof_spec']
 assert spec['assessment_policy']=={'required_method':'derivative_definition'}
 assert spec['allowed_rules']==['rational_hole_limit','derivative_from_limit']
 assert spec['reference_proof']['steps'][-1]['premises']==['reference_step_1']
 assert spec['reference_proof']['steps'][-1]['rule']=='derivative_from_limit'


def test_definition_and_domain_negative_controls_mathematically():
 x,h=sp.symbols('x h',real=True)
 assert sp.limit(((3+h)**2-9)/h,h,0)==6
 assert sp.limit(((-2+h)**2-4)/h,h,0)==-4
 assert sp.limit(sp.Abs(h)/h,h,0,dir='-')==-1
 assert sp.limit(sp.Abs(h)/h,h,0,dir='+')==1
 assert sp.diff((x*x+1)/(x+1),x).subs(x,1)==sp.Rational(1,2)
 assert sp.diff((sp.sqrt(x+1)+1)**2,x).subs(x,3)==sp.Rational(3,2)
 assert sp.diff(sp.sqrt(3*x+1),x).subs(x,1)==sp.Rational(3,4)
 assert sp.sqrt((-4)**2)!=-4
 # A reduced formula does not change the source function's excluded inputs.
 assert sp.solve(x-2,x)==[2]
 assert sp.cancel((x*x-4)/(x-2))==x+2


def test_independent_oracles_cover_every_ordinary_scenario():
 ordinary={q['id'] for s in lessons() for q in s['test']['questions'] if not q.get('proof_spec')}
 assert set(ORACLES)==ordinary and len(ordinary)==80


def test_actual_native_python_generator_and_independent_derivative_oracles():
 loader=pytest.importorskip('quickmaths.content_loader',reason='Requires the actual QuickMaths package in a complete checkout')
 generator=pytest.importorskip('quickmaths.problem_generator')
 from quickmaths.math_syntax import parse_expression
 x=sp.Symbol('x',real=True)
 # Fixture strings are checked-in author data, not arbitrary learner input.
 symbols={name:sp.Symbol(name,real=True) for name in 'a b c d m n k r p q u v du dv l w dl dw target'.split()}
 loc={**symbols,'x':x,'h':sp.Symbol('h',real=True),'sqrt':sp.sqrt}
 for id in IDS:
  skill=loader.load_skill_file(next(SOURCE.glob(id+'_*.yaml')))
  for template in skill.test.questions:
   for variation in range(100):
    p=generator.generate_problem(skill.id,template,1237+variation*104729)
    if p.proof_spec:
     assert p.proof_spec['statement']['goal']
     continue
    spec=ORACLES[template.id]
    if p.grading_method=='multiple_choice':
     assert str(p.expected_answer)==spec['value'];continue
    values={symbols.get(k,sp.Symbol(k,real=True)):sp.Rational(str(v)) for k,v in p.values.items()}
    if spec['kind']=='derivative':
     expected=sp.diff(sp.sympify(spec['function'],locals=loc).subs(values),x)
     if spec.get('at') is not None:expected=expected.subs(x,sp.sympify(spec['at'],locals=loc).subs(values))
    else:expected=sp.sympify(spec.get('expression',spec.get('value')),locals=loc).subs(values)
    actual=parse_expression(str(p.expected_answer),['x','h'])
    assert sp.simplify(expected-actual)==0,(id,template.id,variation,expected,actual)
    if spec.get('exclusions'):
     want={sp.sympify(v,locals=loc).subs(values) for v in spec['exclusions']}
     got={parse_expression(str(v)) for v in p.answer_metadata['excluded_values']}
     assert want==got
