"""Real browser check of legacy draft migration, native formal binding and lesson media."""
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
 result=page.evaluate("""async()=>{
 const {createQuickMathsStore,STORAGE_KEY}=await import('../challenge-core.js');
 const curriculum=await(await fetch('../curriculum-data.json')).json();
 const legacy=await(await fetch('../test-support/native-drafts-v17.json')).json();
 const make=raw=>createQuickMathsStore({curriculum,storage:{getItem:k=>k===STORAGE_KEY?raw:null,setItem(){}}});
 const store=make(JSON.stringify(legacy.state));store.navigate('test','MATH_POLY_002');
 const draft=store.snapshot().activeTest,p=draft.problems.find(p=>p.proof_spec);
 if(store.getFormalWorkspace(p.template_id).assessmentEligible)throw Error('Migration granted credit');
 const before=structuredClone(store.getFormalWorkspace(p.template_id).evidence.request.steps);
 if(!store.getFormalWorkspace(p.template_id).evidence.pending_edit)throw Error('Migration dropped unsaved edit');
 await store.runFormalProof(p.template_id,'cancel');
 const checked=await store.runFormalProof(p.template_id,'verify');
 if(!checked.assessment_eligible)throw Error(JSON.stringify(checked));
 if(JSON.stringify(before)!==JSON.stringify(store.getFormalWorkspace(p.template_id).evidence.request.steps))throw Error('Verification changed learner steps');
 const restored=make(store.exportSyncState());restored.navigate('test','MATH_POLY_002');
 if(restored.getFormalWorkspace(p.template_id).assessmentEligible)throw Error('Reload preserved live authority');
 if(JSON.stringify(restored.snapshot().activeTest.problems)!==JSON.stringify(draft.problems))throw Error('Reload changed questions');
 const skill=curriculum.skills.find(s=>s.id==='MATH_POLY_002');
 // Exercise the actual fixed native clone path with a one-question selection.
 skill.native_templates=skill.native_templates.filter(t=>t.proof_spec);skill.question_count=1;
 const fresh=make(null);fresh.createProfile('Browser compatibility');fresh.completeTutorial({skipped:true});
 fresh.startTest(skill.id,{force:true});const q=fresh.snapshot().activeTest.problems[0];
 await fresh.runFormalProof(q.template_id,'start');
 await fresh.runFormalProof(q.template_id,'append',{claim:q.proof_spec.statement.goal,rule:'ring_identity',premises:[]});
 const verified=await fresh.runFormalProof(q.template_id,'verify');
 if(!verified.assessment_eligible)throw Error('Fresh fixed runtime binding failed');
 const grade=fresh.submitTest();if(!grade.ok)throw Error(JSON.stringify(grade));
 window.smokeState={key:STORAGE_KEY,raw:fresh.exportSyncState()};
 return {legacyProofVerified:true,legacyStepsPreserved:true,reloadRequiresReplay:true,fixedRuntimeProofVerified:true,formalSubmissionAccepted:true};
 }""")
 (BASE/'native-compatibility-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result),flush=True)
 page.evaluate('()=>disposeFormal()')
 state=page.evaluate('()=>window.smokeState')
 page.evaluate('(s)=>localStorage.setItem(s.key,s.raw)',state)
 page.goto(f'http://127.0.0.1:{server.server_port}/#/lesson/MATH_CALC_001')
 page.wait_for_selector('.lesson-media',timeout=30000)
 page.locator('.lesson-media').first.scroll_into_view_if_needed()
 page.locator(".lesson-media img").first.evaluate("img => img.decode()")
 page.screenshot(path=str(BASE/'lesson-desktop.png'),full_page=False)
 page.set_viewport_size({'width':390,'height':844});page.locator('.lesson-media').first.scroll_into_view_if_needed();page.screenshot(path=str(BASE/'lesson-mobile.png'),full_page=False)
 c.close()
server.shutdown()
