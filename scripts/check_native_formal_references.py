"""Check selected published native proof references with real Lean; no learner credit."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'formal-verifier/src'))
from quickmaths_formal.protocol import handle_message

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--skill',action='append',help='Only check this skill; repeat to select more.')
 parser.add_argument('--output',type=Path)
 args=parser.parse_args()
 data=json.loads((ROOT/'docs/curriculum-data.json').read_text(encoding='utf-8'))
 known={s['id'] for s in data['skills']}
 if set(args.skill or [])-known:parser.error('Unknown skill')
 results=[]
 for skill in data['skills']:
  if args.skill and skill['id'] not in args.skill:continue
  seen=set()
  for problem in skill['problems']:
   spec=problem.get('proof_spec');key=problem.get('source_template_id',problem['template_id'])
   if not spec or key in seen:continue
   seen.add(key)
   result=handle_message({'op':'check_reference_text','request_id':problem['template_id'],**spec['statement'],'allowed_rules':spec['allowed_rules'],'reference_steps':spec['reference_proof']['steps'],'max_seconds':60},project_dir=ROOT/'formal-verifier')
   verdict=result.get('result',{}).get('verification',{})
   row={'skill':skill['id'],'question':key,'verified':verdict.get('status')=='verified','certificate':verdict.get('certificate')}
   if not row['verified']:row['diagnostics']=result
   results.append(row);print(('PASS' if row['verified'] else 'FAIL')+' '+key,flush=True)
 if args.output:args.output.write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
 return 0 if results and all(r['verified'] for r in results) else 1
if __name__=='__main__':raise SystemExit(main())
