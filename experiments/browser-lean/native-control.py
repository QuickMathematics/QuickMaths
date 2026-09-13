"""Produce one real native certificate for the browser trust-boundary control."""
from dataclasses import asdict
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'formal-verifier/src'))
from quickmaths_formal.contract import normalize_request
from quickmaths_formal.verifier import verify_request

request=json.loads((ROOT/'formal-verifier/fixtures/guarded_cancellation.json').read_text())
# Same diagnostic budget as kernel_acceptance.py; no production policy change.
request.setdefault('policy',{})['max_seconds']=60
request=normalize_request(request)
result=verify_request(request,project_dir=ROOT/'formal-verifier')
destination=ROOT/'.bridge-runtime/curated-formal/native-certificate.json'
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps({'request':request,'result':asdict(result)},indent=2)+'\n')
print(result.status, result.message)
raise SystemExit(0 if result.status=='verified' and result.certificate else 1)
