from copy import deepcopy
import pytest
from quickmaths_formal.contract import normalize_request
from quickmaths_formal.derivative_definition import matches_derivative_definition
from quickmaths_formal.rules import preflight
from quickmaths_formal.lean import render_request
from quickmaths_formal.state import build_proof_state

def example():
    from quickmaths_formal.parser import parse_goal_text
    goal={'kind':'derivative','variable':'x','expression':{'kind':'pow','base':{'kind':'var','id':'x'},'exponent':2},'point':{'kind':'int','value':3},'result':{'kind':'int','value':6}}
    limit=parse_goal_text('As h approaches 0 from both sides, ((3+h)^2-3^2)/h approaches 6.', ['x','h'])
    raw={'version':'0.1','request_id':'definition-square','variables':[{'id':'x','type':'real'},{'id':'h','type':'real'}],
      'scopes':[{'id':'root','parent':None}],'assumptions':[],
      'steps':[{'id':'quotient_limit','scope':'root','claim':limit,'rule':'rational_hole_limit','premises':[],
                'parameters':{'simplified':{'kind':'add','left':{'kind':'var','id':'h'},'right':{'kind':'int','value':6}}}},
               {'id':'derivative','scope':'root','claim':goal,'rule':'derivative_from_limit','premises':['quotient_limit'],'parameters':{}}],
      'goal':goal,'policy':{'allowed_rules':['rational_hole_limit','derivative_from_limit'],'max_seconds':60,
      'accepted_axioms':['propext','Classical.choice','Quot.sound']}}
    return normalize_request(raw)

def test_exact_difference_quotient_is_required_and_rendered():
    request=example()
    assert not preflight(request)
    assert build_proof_state(request).status=='ready_for_kernel'
    source=render_request(request)
    assert 'hasDerivAt_iff_tendsto_slope_zero.mpr' in source
    assert 'using quotient_limit' in source
    assert 'self_mem_nhdsWithin' in source  # cancellation is justified off zero

@pytest.mark.parametrize('change',[
    lambda l:l.update(direction='right'),
    lambda l:l.update(point={'kind':'int','value':1}),
    lambda l:l['result'].update(value={'kind':'int','value':7}),
    lambda l:l.update(result={'kind':'positive_infinity'}),
    lambda l:l.update(expression={'kind':'int','value':6}),
    lambda l:l['expression'].update(right={'kind':'int','value':2}),
    lambda l:l.update(domain=[{'kind':'lt','left':{'kind':'int','value':0},'right':{'kind':'var','id':'h'}}]),
])
def test_wrong_limit_cannot_certify_derivative(change):
    request=example();change(request['steps'][0]['claim'])
    assert any(o.code=='derivative_definition_limit' for o in preflight(request))
    with pytest.raises(ValueError):render_request(request)

def test_missing_or_extra_citation_rejected():
    for citations in ([],['quotient_limit','quotient_limit']):
        request=example();request['steps'][-1]['premises']=citations
        assert any(o.code=='derivative_definition_limit' for o in preflight(request))

def test_increment_must_not_capture_a_function_parameter():
    request=example();goal=deepcopy(request['goal']);goal['expression']={'kind':'var','id':'h'}
    assert not matches_derivative_definition(goal,request['steps'][0]['claim'])
