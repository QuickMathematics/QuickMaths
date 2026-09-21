from __future__ import annotations
import importlib.util
from pathlib import Path
import pytest,yaml
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('register_derivatives_batch6',ROOT/'scripts/register_derivatives_batch6.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def fixtures(extra=0,indent=''):
 track='id: TRACK_TEST\nentry_skills:\n'+indent+'- MATH_ARITH_001\nexit_skills:\n'+indent+'- MATH_CALC_002\nskills:\n'+indent+'- MATH_ARITH_001\n'+indent+'- MATH_CALC_002\n'
 test='''const AUTHORED_MATH_SCENARIO_COUNTS = Object.freeze({ MATH_CALC_002: 20 });
const assessmentLengths = { MATH_CALC_002: 21 };
assert.equal(curriculum.skills.length, LESSONS);
assert.equal(curriculum.skills.reduce((count, skill) => count + skill.question_count, 0), QUESTIONS);
assert.ok(curriculum.skills.reduce((count, skill) => count + skill.problems.length, 0) > QUESTIONS);
assert.deepEqual(state.subjects.map((subject) => [subject.id, subject.skillIds.length]), [["SUBJECT_MATH", LESSONS]]);
assert.equal(Object.values(AUTHORED_MATH_SCENARIO_COUNTS).reduce((total, count) => total + count, 0), ORDINARY);
'''.replace('LESSONS',str(92+extra)).replace('QUESTIONS',str(1277+extra*20)).replace('ORDINARY',str(1243+extra*20))
 return track,test

@pytest.mark.parametrize('extra',[0,4,20])
@pytest.mark.parametrize('indent',['','  '])
def test_preserves_other_batches_and_is_idempotent(extra,indent):
 track,test=fixtures(extra,indent);nt,nj,changed=m.plan(track,test)
 assert changed;assert yaml.safe_load(nt)['skills']==yaml.safe_load(track)['skills']+list(m.IDS)
 assert yaml.safe_load(nt)['entry_skills']==yaml.safe_load(track)['entry_skills']
 assert yaml.safe_load(nt)['exit_skills']==['MATH_CALC_002','MATH_CALC_006']
 assert f'curriculum.skills.length, {96+extra}' in nj
 assert f'), {1361+extra*20});' in nj
 assert f'), {1323+extra*20});' in nj
 assert m.plan(nt,nj)==(nt,nj,False)

@pytest.mark.parametrize('change',[lambda t:t.replace('assessmentLengths','differentFixtureName'),lambda t:t.replace('MATH_CALC_002: 20','MATH_CALC_003: 20'),lambda t:t.replace('curriculum.skills.length','different.length')])
def test_unrecognized_or_partial_states_fail_before_writes(change):
 track,test=fixtures()
 with pytest.raises(m.RegistrationError):m.plan(track,change(test))
