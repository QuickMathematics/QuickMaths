"""One real client proof under the Pages-style scoped isolation shim."""
import functools, http.server, json, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'.bridge-runtime/formal-rollout';BASE.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(BASE)
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'docs')))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(BASE/'production-profile'),headless=True)
 page=c.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:print(m.text[:400],flush=True) if m.type=='error' else None)
 origin=f'http://127.0.0.1:{server.server_port}'
 page.goto(origin+'/formal-runtime/#/welcome')
 page.locator('#profile-name').wait_for(state='visible',timeout=30000)
 # Exercise first-use service-worker activation without server isolation headers.
 message=page.evaluate("async()=>{const m=await import('../formal-browser.js');try{await m.browserFormalHealth();return 'ready'}catch(e){return e.message}}")
 print('First use:',message,flush=True)
 page.wait_for_event('load',timeout=30000)
 assert page.evaluate('crossOriginIsolated')
 page.locator('#profile-name').wait_for(state='visible')
 page.locator('[data-action="dismiss-agent-welcome"]').click()
 page.locator('#profile-name').fill('Browser rollout smoke')
 page.locator('#create-profile-form button').click()
 page.locator('#app-shell').wait_for(state='visible')
 result=page.evaluate("""async()=>{
 const client=await import('../formal-proof-client.js');
 const curriculum=await(await fetch('../curriculum-data.json')).json();
 const problem=curriculum.skills.find(s=>s.id==='MATH_POLY_001').problems.find(p=>p.proof_spec);
 if(!problem?.formal_job)throw Error('Missing bound lesson proof');
 let session=await client.startFormalProof(problem.formal_job);
 const step=problem.proof_spec.reference_proof.steps[0];
 session=await client.appendFormalStep(session,{...step,stepId:'user_step_1'});
 session=await client.verifyFormalProof(session);
 return {status:session.verification.status,mode:session.verification.certificate.proof_mode,isolated:crossOriginIsolated,base:document.baseURI};
 }""")
 print(json.dumps(result),flush=True)
 assert result['status']=='verified' and result['mode']=='submitted' and result['isolated'],result
 assert not errors,errors
 (BASE/'production-smoke.json').write_text(json.dumps(result,indent=2))
 page.evaluate("async()=>{const m=await import('../formal-runtime/host.js');await m.dispose()}")
 c.close()
server.shutdown()
