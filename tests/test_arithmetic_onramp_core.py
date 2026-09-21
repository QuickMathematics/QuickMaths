"""Independent exact arithmetic oracles for the on-ramp and proportion lessons."""
from fractions import Fraction as F
from pathlib import Path
import pytest
from quickmaths.content_loader import load_skill_file
from quickmaths.problem_generator import generate_problem
from quickmaths.grading import grade_answer
ROOT=Path(__file__).resolve().parents[1]
SKILLS=['MATH_ARITH_006','MATH_ARITH_008','MATH_ALG_009']
CHOICES={'WHOLE_ZERO':'C','WHOLE_ERROR':'B','WHOLE_ESTIMATE':'B','FRADD_WRONG_DEN':'B','FRADD_COMMON_NOT_LEAST':'C','FRADD_MIX_ERROR':'A','FRADD_REFERENCE':'B','PROP_INTERCEPT':'B','PROP_TABLE':'C','PROP_INVERSE_DOMAIN':'A','PROP_DECREASE':'B','PROP_ASSUMPTION':'C','PROP_GRAPH':'B'}
def oracle(id,v):
 if id in CHOICES:return CHOICES[id]
 # These operations reconstruct the mathematics from the question's givens;
 # no answer expressions or generated answer-key variables are evaluated.
 rules={
 'WHOLE_PLACE':lambda:v['h']*100,'WHOLE_EXPAND':lambda:1000*v['k']+100*v['h']+v['u'],
 'WHOLE_COMPARE':lambda:max(v['a'],v['b']),'WHOLE_ADD':lambda:v['a']+v['b'],'WHOLE_SUB':lambda:v['a']-v['b'],
 'WHOLE_MISSING':lambda:v['total']-v['a'],'WHOLE_ARRAY':lambda:v['r']*v['c'],'WHOLE_DISTRIBUTE':lambda:v['m']*v['n'],
 'WHOLE_SHARE':lambda:F(v['n'],v['d']),'WHOLE_GROUP':lambda:F(v['n'],v['d']),
 'WHOLE_REMAINDER':lambda:v['n']%v['d'],'WHOLE_FULL_BOXES':lambda:v['n']//v['d'],'WHOLE_VEHICLES':lambda:(v['n']+v['d']-1)//v['d'],
 'WHOLE_RECONSTRUCT':lambda:v['d']*v['quot']+2,'WHOLE_COMPARE_GAP':lambda:v['a']-v['b'],
 'WHOLE_TWO_STAGE':lambda:v['r']*v['c']-v['sold'],'WHOLE_CAPSTONE':lambda:5,
 'FRADD_SAME':lambda:F(v['a'],v['d'])+F(v['b'],v['d']),'FRADD_SUB_SAME':lambda:F(v['a'],v['d'])-F(v['b'],v['d']),
 'FRADD_UNLIKE':lambda:F(1,v['d'])+F(1,v['e']),'FRADD_NESTED':lambda:F(1,v['d'])+F(v['a'],v['den']),
 'FRADD_SUB_UNLIKE':lambda:F(v['a'],v['d'])-F(1,v['e']),'FRADD_EQUIVALENT':lambda:F(v['den'],v['d']),
 'FRADD_MIXED_CONVERT':lambda:v['w']+F(1,v['d']),'FRADD_IMPROPER_WHOLE':lambda:v['n']//v['d'],
 'FRADD_MIX_ADD':lambda:v['w']+F(3,4)+v['v']+F(2,3),'FRADD_REGROUP':lambda:v['w']+F(1,4)-1-F(2,3),
 'FRADD_FROM_WHOLE':lambda:v['w']-F(v['a'],v['d']),'FRADD_MISSING':lambda:F(v['a'],v['den'])-F(1,v['d']),
 'FRADD_SIGNED':lambda:-F(1,v['d'])+F(3,v['den']),'FRADD_NEGATIVE_SUB':lambda:F(1,v['d'])+F(1,v['den']),
 'FRADD_CONTEXT':lambda:v['w']-F(1,v['d'])-F(1,v['e']),'FRADD_CAPSTONE':lambda:F(5,6),
 'PROP_DIRECT_RATE':lambda:F(v['y'],v['x']),'PROP_DIRECT_OUTPUT':lambda:v['k']*v['x'],'PROP_DIRECT_INPUT':lambda:F(v['y'],v['k']),
 'PROP_DIRECT_FRACTION':lambda:F(v['x'],v['d']),'PROP_DIRECT_SCALE':lambda:F(v['y']*v['newx'],v['x']),
 'PROP_DIRECT_ZERO':lambda:0,'PROP_INVERSE_CONSTANT':lambda:v['x']*v['y'],'PROP_INVERSE_OUTPUT':lambda:F(v['k'],v['x']),
 'PROP_INVERSE_INPUT':lambda:F(v['k'],v['y']),'PROP_INVERSE_SCALE':lambda:F(v['x']*v['y'],v['newx']),
 'PROP_UNITS':lambda:F(v['rate']*v['minutes'],60),'PROP_FIXED_DISTANCE':lambda:F(v['distance'],v['speed']),
 'PROP_WORKERS':lambda:F(v['a']*v['t'],v['b']),'PROP_CAPSTONE':lambda:1}
 return rules[id]()
@pytest.mark.parametrize('skill_id',SKILLS)
def test_independent_answers_and_wrong_controls(skill_id):
 skill=load_skill_file(next((ROOT/'content/math/algebra_foundations/skills').glob(skill_id+'_*.yaml')))
 for template in skill.test.questions:
  for seed in range(100 if template.type=='generated' else 1):
   p=generate_problem(skill.id,template,seed)
   expected=oracle(template.id,{k:F(v) for k,v in p.values.items()})
   if template.id in CHOICES:
    assert p.expected_answer==expected
    assert grade_answer(p,expected).is_correct
    for choice in p.options:assert grade_answer(p,choice['id']).is_correct==(choice['id']==expected)
   else:
    assert F(p.expected_answer)==expected,(template.id,seed)
    # Review-required work deliberately remains pending; check only its final answer.
    good=grade_answer(p,str(expected));bad=grade_answer(p,str(expected+1))
    assert good.final_answer_grade.status=='correct'
    assert bad.final_answer_grade.status=='incorrect'
