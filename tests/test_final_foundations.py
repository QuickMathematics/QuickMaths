"""Independent rendered-answer oracles for the four native final lessons."""
from fractions import Fraction as F
from pathlib import Path
import pytest
from quickmaths.content_loader import load_skill_file
from quickmaths.problem_generator import generate_problem
from quickmaths.grading import grade_answer
ROOT=Path(__file__).resolve().parents[1]
IDS=['MATH_GEOM_011','MATH_GEOM_012','MATH_ALG_010','MATH_RAD_002']
def skill(i): return load_skill_file(next((ROOT/'content/math/algebra_foundations/skills').glob(i+'_*.yaml')))
def vals(p): return {k:F(v) for k,v in p.values.items()}
def oracle(i,v):
 r={
 'GEOM011_DISK_RADIUS':lambda:v['r']**2,'GEOM011_DIAMETER_RADIUS':lambda:v['d']/2,'GEOM011_QUARTER_SECTOR':lambda:v['r']**2/4,'GEOM011_SEMICIRCLE':lambda:v['r']**2/2,'GEOM011_SECTOR_60':lambda:v['r']**2/6,'GEOM011_SECTOR_120':lambda:v['r']**2/3,'GEOM011_ANNULUS_RADII':lambda:v['R']**2-v['r']**2,'GEOM011_ANNULUS_DIAMETERS':lambda:(v['D']**2-v['d']**2)/4,'GEOM011_SCALE':lambda:v['k']**2,'GEOM011_CIRCUMFERENCE_COEFFICIENT':lambda:v['c']/2,'GEOM011_AREA_COEFFICIENT':lambda:v['r'],'GEOM011_QUARTER_SUM':lambda:v['r']**2,'GEOM011_RING_SCALE':lambda:4*v['a'],'GEOM011_RADIUS_FROM_SECTOR':lambda:v['r'],'GEOM011_OUTER_FROM_RING':lambda:v['R'],'GEOM011_SECTOR_30':lambda:v['r']**2/12,'GEOM011_SECTOR_270':lambda:3*v['r']**2/4,'GEOM011_DISK_DIAMETER_AREA':lambda:v['d']**2/4,'GEOM011_COMPOSITE_COEFFICIENT':lambda:v['R']**2-v['r']**2,'GEOM011_SECTOR_ANGLE':lambda:v['angle']*v['r']**2/360,'GEOM011_SECTOR_FRACTION':lambda:v['angle']/360,'GEOM011_SECTOR_ANGLE_FROM_FRACTION':lambda:360*v['f'],'GEOM011_SEMIDISK_MODEL':lambda:'B','GEOM011_SECTOR_ARC_UNITS':lambda:'C','GEOM011_ANNULUS_MODEL':lambda:'B','GEOM011_NONCONCENTRIC_HOLES':lambda:'C','GEOM011_AREA_ARC_SCALE':lambda:'B','GEOM011_SQUARE_MINUS_QUARTER':lambda:'A','GEOM011_SECTOR_ANGLE_ERROR':lambda:'D','GEOM011_COMPOSITE_CHECK':lambda:'B','GEOM011_SECTOR_COMPARISON':lambda:'B','GEOM011_CAPSTONE':lambda:F(28),
 'GEOM012_CUBOID_VOLUME':lambda:v['L']*v['W']*v['H'],'GEOM012_CUBOID_SURFACE':lambda:2*(v['L']*v['W']+v['L']*v['H']+v['W']*v['H']),'GEOM012_CUBE_VOLUME':lambda:v['s']**3,'GEOM012_CUBE_SURFACE':lambda:6*v['s']**2,'GEOM012_PRISM_VOLUME':lambda:v['B']*v['H'],'GEOM012_CYLINDER_VOLUME_FACTOR':lambda:v['r']**2*v['h'],'GEOM012_CYLINDER_SURFACE_FACTOR':lambda:2*v['r']**2+2*v['r']*v['h'],'GEOM012_CAPACITY':lambda:v['L']*v['W']*v['H']/1000,'GEOM012_OPEN_BOX':lambda:v['L']*v['W']+2*v['L']*v['H']+2*v['W']*v['H'],'GEOM012_LATERAL_PRISM':lambda:v['P']*v['H']+2*v['B'],'GEOM012_HIDDEN_FACES':lambda:6*v['n']-2*(v['n']-1),'GEOM012_SCALE_VOLUME':lambda:v['k']**3,'GEOM012_SCALE_SURFACE':lambda:v['k']**2,'GEOM012_CUBE_FROM_VOLUME':lambda:v['s'],'GEOM012_CYLINDER_DIAMETER':lambda:v['d']**2*v['h']/4,'GEOM012_DIMENSIONAL_CHECK':lambda:'B','GEOM012_NET_FACES':lambda:2*(v['A']+v['B']+v['C']),'GEOM012_LITRE_CONVERSION':lambda:v['v']/1000,'GEOM012_JOINED_CUBES':lambda:10*v['s']**2,'GEOM012_CAPSTONE':lambda:F(24),
 'ALG010_VERTEX_X':lambda:v['h'],'ALG010_VERTEX_Y':lambda:v['k'],'ALG010_EVALUATE':lambda:v['a']*abs(v['x']-v['h'])+v['k'],'ALG010_EQUATION_DISTANCE':lambda:F(2),'ALG010_EQUATION_ZERO':lambda:F(1),'ALG010_EQUATION_NEGATIVE':lambda:F(0),'ALG010_WITHIN_RADIUS':lambda:v['h']-v['d'],'ALG010_WITHIN_RIGHT':lambda:v['h']+v['d'],'ALG010_OUTSIDE_RADIUS':lambda:F(2),'ALG010_NEG_SCALE_WITHIN':lambda:v['d'],'ALG010_POS_SCALE_THRESHOLD':lambda:v['d'],'ALG010_ENDPOINT_INCLUDED':lambda:F(1),'ALG010_FIXED_TWO':lambda:{'-3','11'},'ALG010_FIXED_ONE':lambda:{'-5'},'ALG010_FIXED_NONE':lambda:set(),'ALG010_FIXED_WITHIN':lambda:'(-1,7)','ALG010_FIXED_OUTSIDE':lambda:'(-inf,-7] U [3,inf)','ALG010_FIXED_NEGATIVE_SCALE':lambda:'[1,5]','ALG010_FIXED_TOLERANCE':lambda:'[17.75,18.25]','ALG010_VERTEX':lambda:'B','ALG010_SCALED_EQUATION':lambda:{'-1','7'},'ALG010_COMPOUND_INTERVAL':lambda:('[%s,%s]'%(v['left'],v['right'])),'ALG010_IMPOSSIBLE_INEQUALITY':lambda:'C','ALG010_ALWAYS_TRUE_INEQUALITY':lambda:'A','ALG010_STRICT_OUTSIDE':lambda:F(2),'ALG010_TARGET_TOLERANCE':lambda:'[17.75,18.25]','ALG010_STRICT_TOLERANCE':lambda:'(-inf,17.75) U (18.25,inf)','ALG010_BAD_DIVIDE':lambda:'D','ALG010_RANGE_UPWARD':lambda:'A','ALG010_RANGE_DOWNWARD':lambda:'B','ALG010_SIGNED_DISTANCE':lambda:abs(v['x']-v['h']),'ALG010_CASE_SPLIT':lambda:'C','ALG010_ENDPOINT_BOUNDARY':lambda:'A','ALG010_SHIFTED_FINITE_SET':lambda:{str(v['left']),str(v['right'])},'ALG010_REFLECTED_ONE':lambda:F(1),'ALG010_CAPSTONE':lambda:'[8,12]',
 'RAD002_CUBE_ROOT':lambda:v['x'],'RAD002_FIFTH_ROOT':lambda:v['x'],'RAD002_FOURTH_ROOT':lambda:v['x'],'RAD002_SIXTH_ROOT':lambda:v['x'],'RAD002_RATIONAL_POWER':lambda:v['q']**v['m'],'RAD002_NEGATIVE_POWER':lambda:F(1,v['q']),'RAD002_NEGATIVE_POWER_TWO':lambda:F(1,v['q']**2),'RAD002_ROOT_DOMAIN_POINT':lambda:v['c'],'RAD002_ODD_DOMAIN':lambda:F(0),'RAD002_RECIPROCAL_DOMAIN':lambda:F(1),'RAD002_PRINCIPAL_FIXED':lambda:F(7),'RAD002_EQUATION_FIXED':lambda:{'-7','7'},'RAD002_ODD_NEGATIVE_FIXED':lambda:F(-2),'RAD002_FOURTH_EQUATION':lambda:{'-2','2'},'RAD002_NO_REAL_EVEN':lambda:'B','RAD002_EXACT_POWER':lambda:F(8),'RAD002_NEGATIVE_RATIONAL':lambda:F(1,4),'RAD002_DOMAIN_FIXED':lambda:'[3,inf)','RAD002_APPROX_BRACKET':lambda:F(2),'RAD002_ODD_ROOT':lambda:v['x'],'RAD002_EVEN_ROOT':lambda:v['x'],'RAD002_RATIONAL_POWER':lambda:v['q']**v['m'],'RAD002_NEGATIVE_POWER':lambda:F(1,v['q']),'RAD002_PRINCIPAL_VS_EQUATION':lambda:'B','RAD002_EVEN_ABS_SYMBOLIC':lambda:'C','RAD002_NEGATIVE_BASE_COUNTEREXAMPLE':lambda:'A','RAD002_ODD_RATIONAL_NEGATIVE':lambda:F(4),'RAD002_EVEN_DOMAIN':lambda:'[3,inf)','RAD002_ODD_DOMAIN':lambda:'(-inf,inf)','RAD002_RECIPROCAL_EVEN_DOMAIN':lambda:'(2,inf)','RAD002_RECIPROCAL_ODD_DOMAIN':lambda:'(-inf,2) U (2,inf)','RAD002_FOURTH_EQUATION':lambda:{'-2','2'},'RAD002_ODD_EQUATION':lambda:{'-2'},'RAD002_NO_REAL_EVEN':lambda:'B','RAD002_PRODUCT_LAW':lambda:'C','RAD002_EXACT_POWER':lambda:F(8),'RAD002_NEGATIVE_POWER_ZERO':lambda:'D','RAD002_CAPSTONE':lambda:{'-3','3'}}
 return r[i]()
@pytest.mark.parametrize('sid',IDS)
def test_independent_answers_and_wrong_controls(sid):
 s=skill(sid)
 for t in s.test.questions:
  for seed in range(100 if t.type=='generated' else 1):
   p=generate_problem(s.id,t,seed); e=oracle(t.id,vals(p)); m=t.grading.get('method')
   if m=='multiple_choice':
    assert p.expected_answer==e and grade_answer(p,e).is_correct
    for o in p.options: assert grade_answer(p,o['id']).is_correct==(o['id']==e)
   elif isinstance(e,set):
    assert set(p.answer_metadata.get('values',[]))==e and grade_answer(p,p.expected_answer).is_correct
   elif isinstance(e,str) and e[:1] in '([':
    assert grade_answer(p,e).is_correct
   else:
    if m=='numeric_with_tolerance':
     assert grade_answer(p,str(e)).final_answer_grade.status=='correct',(t.id,seed,p.expected_answer,e)
     assert grade_answer(p,str(e+1)).final_answer_grade.status=='incorrect'
    else:
     assert F(p.expected_answer)==e,(t.id,seed)
     assert grade_answer(p,str(e)).final_answer_grade.status=='correct'
     assert grade_answer(p,str(e+1)).final_answer_grade.status=='incorrect'


def test_real_root_notation_and_boundary_errors():
    cases = [
        ('MATH_ALG_010', 'ALG010_SCALED_EQUATION', '{-1,7}', '7'),
        ('MATH_ALG_010', 'ALG010_CAPSTONE', '[8,12]', '(8,12)'),
        ('MATH_RAD_002', 'RAD002_ODD_RATIONAL_NEGATIVE', '4', '-4'),
        ('MATH_RAD_002', 'RAD002_FOURTH_EQUATION', '{-2,2}', '2'),
        ('MATH_RAD_002', 'RAD002_ODD_EQUATION', '{-2}', '{2}'),
        ('MATH_RAD_002', 'RAD002_RECIPROCAL_EVEN_DOMAIN', '(2,inf)', '[2,inf)'),
        ('MATH_RAD_002', 'RAD002_RECIPROCAL_ODD_DOMAIN', '(-inf,2) U (2,inf)', '(-inf,inf)'),
    ]
    for sid, tid, correct, wrong in cases:
        skill=load_skill_file(next((ROOT/'content/math/algebra_foundations/skills').glob(sid+'_*.yaml')))
        problem=generate_problem(sid,next(t for t in skill.test.questions if t.id==tid),17)
        assert grade_answer(problem,correct).final_answer_grade.status=='correct',tid
        assert grade_answer(problem,wrong).final_answer_grade.status=='incorrect',tid
