"""Focused real browser derivative-definition success and rejection checks."""
import functools,http.server,json,os,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=Path(os.environ.get('QM_BROWSER_TEST_DIR', str(ROOT/'.bridge-runtime/derivative-definition')));BASE.mkdir(parents=True,exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(BASE)
class Handler(http.server.SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');super().end_headers()
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'docs')))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(BASE/'profile'),headless=True)
 page=c.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/formal-runtime/validation.html');page.wait_for_function('typeof browserRpc=== "function"')
 request=json.loads((ROOT/'formal-verifier/fixtures/derivative_definition_square.json').read_text())
 started=time.monotonic();result=page.evaluate('(request)=>browserRpc({op:"check",request})',request)
 assert result['status']=='verified',result
 positive={'status':result['status'],'elapsedSeconds':time.monotonic()-started,'certificate':result['certificate']}
 bad=json.loads(json.dumps(request));bad['goal']['result']['value']=7;bad['steps'][-1]['claim']['result']['value']=7;bad['steps'][0]['claim']['result']['value']['value']=7
 rejected=page.evaluate('(request)=>browserRpc({op:"check",request})',bad)
 assert rejected['status']!='verified' and not rejected.get('certificate'),rejected
 ui=page.evaluate("""async()=>{
 const {createQuickMathsStore}=await import('../challenge-core.js');
 const {buildBoundFormalJob}=await import('../formal-binding.js');
 const curriculum=await(await fetch('../curriculum-data.json')).json();
 const skill=curriculum.skills.find(s=>s.id==='MATH_ARITH_001');
 const template=curriculum.skills.find(s=>s.id==='MATH_POLY_001').problems.find(p=>p.proof_spec);
 const problem=structuredClone(skill.problems[0]);
 const goal='The derivative of x^2 with respect to x at 3 is 6.';
 Object.assign(problem,{template_id:'DEFINITION_TEST',skill_id:skill.id,prompt:goal,seed:1,values:{},
 proof_spec:{...structuredClone(template.proof_spec),statement:{goal,declarations:['x:real','h:real'],assumptions:[]},
 allowed_rules:['rational_hole_limit','derivative_from_limit','polynomial_derivative'],assessment_policy:{required_method:'derivative_definition'},reference_proof:{}}});
 problem.formal_job=buildBoundFormalJob(problem);skill.problems=[problem];skill.native_templates=[];skill.question_count=1;
 const store=createQuickMathsStore({curriculum,storage:{getItem:()=>null,setItem(){}}});store.createProfile('Definition');store.completeTutorial({skipped:true});store.startTest(skill.id);
 const id=store.snapshot().activeTest.problems[0].template_id;
 await store.runFormalProof(id,'start');
 await store.runFormalProof(id,'append',{claim:goal,rule:'polynomial_derivative',premises:[]});
 let blocked=false;try{await store.runFormalProof(id,'verify')}catch(e){blocked=/Required method/.test(e.message)}
 if(!blocked||store.getFormalWorkspace(id).assessmentEligible)throw Error('Shortcut received method credit');
 await store.runFormalProof(id,'start');
 await store.runFormalProof(id,'append',{claim:'As h approaches 0 from both sides, ((3+h)^2-3^2)/h approaches 6.',rule:'rational_hole_limit',premises:[],parameters:{simplified:'h+6'}});
 await store.runFormalProof(id,'append',{claim:goal,rule:'derivative_from_limit',premises:['user_step_1']});
 const checked=await store.runFormalProof(id,'verify');
 if(!checked.assessment_eligible)throw Error(JSON.stringify(checked));
 return {shortcutBlocked:blocked,definitionEligible:checked.assessment_eligible};
 }""")
 evidence={'nativeSourceBrowserPositive':positive,'falseLimitRejected':{'status':rejected['status'],'certificate':rejected.get('certificate')},'learnerFlow':ui}
 (BASE/'results.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
 print(json.dumps({'positive':positive['status'],'falseLimit':rejected['status'],'learnerFlow':ui}),flush=True)
 page.evaluate('()=>disposeFormal()');c.close()
server.shutdown()
