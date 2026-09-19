import json
import os
from pathlib import Path
from quickmaths_formal.browser_host import browser_rpc
from quickmaths_formal import verifier

FIXTURES=Path(__file__).parents[1]/'fixtures'
TEST_DIR=Path(__file__).resolve().parents[2]/'.bridge-runtime/formal-host-tests'
if os.name == 'nt':
    assert TEST_DIR.drive.upper() in {'X:', 'F:'}
TEST_DIR.mkdir(parents=True,exist_ok=True)
def request(name):
    return json.loads((FIXTURES/name).read_text())

def test_prepared_proof_cannot_issue_certificate_without_live_kernel_reply():
    result=json.loads(browser_rpc(json.dumps({'op':'check','request':request('guarded_cancellation.json')}),'{}',project_dir=TEST_DIR))
    assert result['done'] is False
    assert 'certificate' not in result
    assert '#print axioms QuickMathsGenerated.result' in result['source']
    assert verifier._browser_kernel is None

def test_domain_failure_never_reaches_browser_kernel():
    result=json.loads(browser_rpc(json.dumps({'op':'check','request':request('missing_restriction.json')}),'{}',project_dir=TEST_DIR))
    assert result['done'] is True
    verification=result['response']['result']
    assert verification['status']=='needs_justification'
    assert verification['certificate'] is None
    assert verifier._browser_kernel is None
