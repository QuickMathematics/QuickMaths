"""Check all four Batch 6 references and their method policies.
Default mode requires fresh Lean certificates. --preflight-only is explicitly
non-certifying and must never be used as a publication/assessment pass.
"""
from __future__ import annotations
import argparse,json,subprocess,sys
from pathlib import Path
IDS={f'MATH_CALC_{i:03d}' for i in range(3,7)}
ROOT=Path(__file__).resolve().parents[1]

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--curriculum',type=Path,default=ROOT/'docs/curriculum-data.json')
 p.add_argument('--preflight-only',action='store_true')
 p.add_argument('--output',type=Path,required=True)
 a=p.parse_args();sys.path.insert(0,str(ROOT/'formal-verifier/src'))
 from quickmaths_formal.protocol import handle_message
 data=json.loads(a.curriculum.read_text(encoding='utf-8'))
 skills=[s for s in data['skills'] if s['id'] in IDS]
 if {s['id'] for s in skills}!=IDS:p.error('The canonical curriculum must contain all four Batch 6 IDs')
 rows=[];okay=True
 for s in skills:
  questions={q.get('source_template_id',q['template_id']):q for q in s['problems'] if q.get('proof_spec')}
  if len(questions)!=1:p.error(s['id']+' must have exactly one formal scenario')
  q=next(iter(questions.values()));spec=q['proof_spec']
  msg={'op':'check_reference_text','request_id':q.get('formal_job',{}).get('rpc',{}).get('request_id',q['template_id']),**spec['statement'],'allowed_rules':spec['allowed_rules'],'reference_steps':spec['reference_proof']['steps'],'max_seconds':60}
  result=handle_message(msg,project_dir=ROOT/'formal-verifier');body=result.get('result',{});verdict=body.get('verification',{})
  request=body.get('request');method_ok=False;method_error='No parsed reference request'
  if request:
   js="import {assertFormalMethod} from "+json.dumps((ROOT/'docs/formal-method-policy.js').as_uri())+"; let input=''; for await (const c of process.stdin) input+=c; const p=JSON.parse(input); assertFormalMethod(p.policy,p.request);"
   run=subprocess.run(['node','--input-type=module','-e',js],input=json.dumps({'policy':spec.get('assessment_policy',{}),'request':request}),text=True,capture_output=True,timeout=20)
   method_ok=run.returncode==0;method_error=run.stderr if not method_ok else None
  ready=body.get('proof_state',{}).get('status')=='ready_for_kernel'
  verified=verdict.get('status')=='verified' and bool(verdict.get('certificate'))
  passed=method_ok and (ready if a.preflight_only else verified)
  row={'skill_id':s['id'],'question_id':q.get('source_template_id'), 'mode':'preflight_only' if a.preflight_only else 'kernel_required',
       'preflight_ready':ready,'method_policy_passed':method_ok,'verified':verified,'certificate':verdict.get('certificate'),
       'passed_requested_gate':passed,'diagnostics':result,'method_error':method_error}
  rows.append(row);okay=okay and passed
  print(('READY (not certified)' if a.preflight_only and passed else 'VERIFIED' if passed else 'FAIL')+' '+s['id'],flush=True)
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')
 return 0 if okay else 1
if __name__=='__main__':raise SystemExit(main())
