"""Exact difference-quotient interface; validity still belongs to Lean."""
from .logic import substitute_expr
from .contract import canonical_hash

def _variables(value):
    if isinstance(value, dict):
        return ({value['id']} if value.get('kind') == 'var' else set()).union(*(_variables(v) for v in value.values()))
    if isinstance(value, list):
        return set().union(*(_variables(v) for v in value))
    return set()

def matches_derivative_definition(goal, limit):
    if goal.get('kind') != 'derivative' or limit.get('kind') != 'limit': return False
    if limit.get('direction') != 'both' or limit.get('domain') or limit.get('point') != {'kind':'int','value':0}: return False
    if limit.get('result',{}).get('kind') != 'finite' or limit['result']['value'] != goal['result']: return False
    h = limit['variable']; x = goal['variable']
    free = (_variables(goal['expression']) - {x}) | _variables(goal['point']) | _variables(goal['result'])
    if h in free: return False
    increment = {'kind':'var','id':h}
    shifted = {'kind':'add','left':goal['point'],'right':increment}
    quotient = {'kind':'div','left':{'kind':'sub',
        'left':substitute_expr(goal['expression'],x,shifted),
        'right':substitute_expr(goal['expression'],x,goal['point'])},'right':increment}
    return canonical_hash(limit['expression']) == canonical_hash(quotient)
