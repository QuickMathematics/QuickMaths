"""Focused real-browser scope/method integration; six small proofs, no full corpus."""
import functools,http.server,json,os,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'.bridge-runtime/formal-methods';BASE.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(BASE)
class Handler(http.server.SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');super().end_headers()
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'docs')))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(BASE/'profile'),headless=True)
 page=c.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/formal-runtime/validation.html')
 page.wait_for_function('typeof browserRpc=== "function"')
 result=page.evaluate("""async()=>{
 const {createQuickMathsStore,STORAGE_KEY}=await import('../challenge-core.js');
 const {buildBoundFormalJob}=await import('../formal-binding.js');
 const corpus=await(await fetch('../curriculum-data.json')).json();
 const run=async(method,goal,declarations,assumptions,build)=>{
  const curriculum=structuredClone(corpus),skill=curriculum.skills.find(s=>s.id==='MATH_ARITH_001');
  const problem=structuredClone(skill.problems[0]);
  const template=corpus.skills.find(s=>s.id==='MATH_POLY_001').problems.find(p=>p.proof_spec);
  Object.assign(problem,{template_id:'METHOD_'+method,skill_id:skill.id,seed:1,values:{},prompt:goal,
   proof_spec:{...structuredClone(template.proof_spec),statement:{goal,declarations,assumptions},allowed_rules:[],assessment_policy:{required_method:method},reference_proof:{}}});
  problem.formal_job=buildBoundFormalJob(problem);skill.problems=[problem];skill.native_templates=[];skill.question_count=1;
  const store=createQuickMathsStore({curriculum,storage:{getItem:()=>null,setItem(){}}});store.createProfile('Methods');store.completeTutorial({skipped:true});store.startTest(skill.id);
  const id=store.snapshot().activeTest.problems[0].template_id;
  const action=(kind,input={})=>store.runFormalProof(id,kind,input);
  const request=()=>store.getFormalWorkspace(id).evidence.request;
  await action('start');if(method==='implication')window.qmUi={curriculum,initial:store.exportSyncState(),key:STORAGE_KEY};await build(action,request);
  const checked=await action('verify');if(!checked.assessment_eligible)throw Error(method+JSON.stringify({checked,state:store.getFormalWorkspace(id).evidence.proof_state}));
  // Saved evidence cannot carry live assessment authority to a new runtime.
  const archived=store.exportSyncState();const restored=createQuickMathsStore({curriculum,storage:{getItem:key=>key===STORAGE_KEY?archived:null,setItem(){}}});
  if(restored.getFormalWorkspace(id).assessmentEligible)throw Error('Restored proof acquired live credit');
  return {method,verified:true,steps:request().steps.length};
 };
 const results=[];
 results.push(await run('implication','(x = 0) implies (x = 0)',['x:real'],[],async(a,r)=>{
  const opened=await a('open_scope',{scope:'root',kind:'assumption',assumption:'x = 0'});
  const h=r().assumptions.at(-1).id;
  await a('close_scope',{scope:opened.selected_scope,claim:'(x = 0) implies (x = 0)',rule:'imp_intro',premises:[h]});
 }));
 results.push(await run('universal_introduction','forall z:real, z = z',[],[],async(a,r)=>{
  const opened=await a('open_scope',{scope:'root',kind:'arbitrary',declarations:['z:real']});
  await a('append',{scope:opened.selected_scope,claim:'z = z',rule:'eq_refl',premises:[]});
  await a('close_scope',{scope:opened.selected_scope,claim:'forall z:real, z = z',rule:'forall_intro',premises:[r().steps.at(-1).id]});
 }));
 results.push(await run('cases','(x = 1) or (x = 0)',['x:real'],['(x = 0) or (x = 1)'],async(a,r)=>{
  await a('open_scope',{scope:'root',kind:'cases',premiseId:'h1'});
  const branches=r().scopes.filter(s=>s.parent==='root');const cited=['h1'];
  for(let i=0;i<2;i++){const scope=branches[i].id,h=r().assumptions.find(h=>h.scope===scope).id;
   await a('append',{scope,claim:'(x = 1) or (x = 0)',rule:i===0?'or_intro_right':'or_intro_left',premises:[h]});cited.push(h,r().steps.at(-1).id);}
  await a('close_scope',{scope:branches[0].id,claim:'(x = 1) or (x = 0)',rule:'or_elim',premises:cited});
 }));
 results.push(await run('induction','forall n:nat, n + 0 = n',[],[],async(a,r)=>{
  await a('append',{scope:'root',claim:'0 + 0 = 0',rule:'norm_num',premises:[]});const base=r().steps.at(-1).id;
  const opened=await a('open_scope',{scope:'root',kind:'arbitrary',declarations:['k:nat'],assumption:'k + 0 = k'});const h=r().assumptions.at(-1).id;
  await a('append',{scope:opened.selected_scope,claim:'(k + 1) + 0 = k + 1',rule:'ring_identity',premises:[]});
  await a('close_scope',{scope:opened.selected_scope,claim:'forall n:nat, n + 0 = n',rule:'nat_induction',premises:[base,h,r().steps.at(-1).id]});
 }));
 results.push(await run('contradiction','not (x = 0)',['x:real'],['not (x = 0)'],async(a,r)=>{
  const opened=await a('open_scope',{scope:'root',kind:'assumption',assumption:'x = 0'});const h=r().assumptions.at(-1).id;
  await a('append',{scope:opened.selected_scope,claim:'false',rule:'contradiction',premises:['h1',h]});
  await a('close_scope',{scope:opened.selected_scope,claim:'not (x = 0)',rule:'not_intro',premises:[h,r().steps.at(-1).id]});
 }));
 results.push(await run('existential_elimination','1 = 1',[],['exists z:real, z = z'],async(a,r)=>{
  const opened=await a('open_scope',{scope:'root',kind:'arbitrary',declarations:['w:real'],assumption:'w = w'});const h=r().assumptions.at(-1).id;
  await a('append',{scope:opened.selected_scope,claim:'1 = 1',rule:'eq_refl',premises:[]});
  await a('close_scope',{scope:opened.selected_scope,claim:'1 = 1',rule:'exists_elim',premises:['h1',h,r().steps.at(-1).id]});
 }));
 return results;
 }""")
 print(json.dumps(result),flush=True);(BASE/'results.json').write_text(json.dumps(result,indent=2))
 page.evaluate('()=>disposeFormal()')
 ui=page.evaluate('qmUi')
 page.route('**/curriculum-data.json*',lambda route:route.fulfill(json=ui['curriculum']))
 page.evaluate('(ui)=>localStorage.setItem(ui.key,ui.initial)',ui)
 page.goto(f'http://127.0.0.1:{server.server_port}/formal-runtime/#/test/MATH_ARITH_001')
 # Keep the test on the actual learner page: UI events must persist subproof edits.
 page.locator('[data-formal-proof-panel]').wait_for(timeout=30000)
 dismiss=page.locator('[data-action="dismiss-agent-welcome"]')
 if dismiss.is_visible():dismiss.click()
 page.get_by_text('Open a subproof or cases',exact=True).click()
 page.locator('[data-subproof-field="assumption"]').fill('x = 0')
 page.locator('[data-action="formal-open-scope"]').click()
 page.locator('[data-formal-scope] option[value="user_scope_1"]').wait_for(state='attached',timeout=60000)
 page.locator('[data-formal-field="claim"]').fill('(x = 0) implies (x = 0)')
 page.locator('[data-formal-field="rule"]').select_option('imp_intro')
 page.locator('[data-formal-field="premises"]').fill('user_assumption_1')
 page.get_by_text('Close this subproof into root',exact=True).click()
 page.locator('[data-action="formal-close-scope"]').click()
 page.locator('[data-proof-step="user_step_1"]').wait_for(timeout=30000)
 assert page.locator('[data-formal-scope]').input_value()=='root'
 # Opening/closing alone cannot certify; the tested store path above does that.
 assert page.locator('.formal-proof-certified').count()==0
 print('Learner UI open/close: passed',flush=True)
 c.close()
server.shutdown()
