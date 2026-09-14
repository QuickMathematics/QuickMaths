"""Focused edge regressions; opt into the actual kernel with QM_TEST_KERNEL=1."""
import json
import os
from copy import deepcopy
from pathlib import Path

import pytest

from quickmaths_formal.contract import normalize_request
from quickmaths_formal.lean import render_request
from quickmaths_formal.parser import parse_expression_text
from quickmaths_formal.verifier import verify_request

ROOT = Path(__file__).parents[1]


@pytest.mark.parametrize('expression', [
    '(-3 * real(n)^2) * (1/2)^n',
    '((3/5) * real(n)^2) * (1/2)^n',
    '((real(n)+1)^2 - 2*real(n) - 1) * (1/2)^n',
    '((3*real(n)^2) * (1/2)^n) / (5*real(n)^4)',
])
def test_direct_monomial_preserves_original_expression(expression):
    request = json.loads((ROOT / 'fixtures/series_root_monomial_geometric_summable.json').read_text())
    request['goal']['expression'] = parse_expression_text(expression, {'n'})
    request['steps'][0]['claim'] = deepcopy(request['goal'])
    source = render_request(normalize_request(request))
    assert 'hcanonical' in source
    assert 'div_tendsto_atTop_leadingCoeff_div_of_degree_eq' not in source
    if os.environ.get('QM_TEST_KERNEL') == '1':
        request['policy']['max_seconds'] = 60
        result = verify_request(request, project_dir=ROOT)
        assert result.status == 'verified', result.stdout + result.stderr + result.message
        assert result.certificate


def test_nonmonomial_keeps_general_polynomial_argument():
    request = json.loads((ROOT / 'fixtures/series_root_polynomial_geometric_summable.json').read_text())
    assert 'div_tendsto_atTop_leadingCoeff_div_of_degree_eq' in render_request(normalize_request(request))
