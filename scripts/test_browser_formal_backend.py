"""Focused live browser backend check; no production assessment writes."""
import functools,http.server,json,os,threading,sys,runpy,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'.bridge-runtime/formal-rollout';BASE.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(BASE)
class Handler(http.server.SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');super().end_headers()
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'docs')))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(BASE/'profile'),headless=True)
 page=c.new_page();page.on('pageerror',lambda e:print('Page error:',e,flush=True));page.on('console',lambda m:print(m.text[:250],flush=True) if m.type=='error' else None)
 page.goto(f'http://127.0.0.1:{server.server_port}/formal-runtime/');page.wait_for_function('typeof browserRpc==="function"')
 if '--preflight' in sys.argv:
  sys.path.insert(0,str(ROOT/'formal-verifier/src'))
  from quickmaths_formal.lean import render_request
  from quickmaths_formal.contract import normalize_request
  inventory=runpy.run_path(str(ROOT/'formal-verifier/scripts/kernel_acceptance.py'))
  page.evaluate("""()=>{const worker=new Worker('./python-worker.js',{type:'module'});let id=0;window.prepareProof=message=>new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data.result);worker.postMessage({id:++id,message,replies:{}});});}""")
  evidence=[]
  for name in inventory['POSITIVE']:
   request=inventory['load_fixture'](name);prepared=page.evaluate('(request)=>prepareProof({op:"check",request})',request)
   assert not prepared['done'],(name,prepared)
   assert prepared['source']==render_request(normalize_request(request)),name
   evidence.append({'name':name,'sourceHash':hashlib.sha256(prepared['source'].encode()).hexdigest(),'exactNativeSource':True})
  for name,expected in inventory['NEGATIVE'].items():
   prepared=page.evaluate('(request)=>prepareProof({op:"check",request})',inventory['load_fixture'](name))
   assert prepared['done'],name
   result=prepared['response']['result'];assert result['status']==expected and result.get('certificate') is None,(name,result)
   evidence.append({'name':name,'status':result['status'],'certificate':None})
  (BASE/'preflight.json').write_text(json.dumps(evidence,indent=2));print('Exact source positives:',len(inventory['POSITIVE']),'Negative rejections:',len(inventory['NEGATIVE']),flush=True)
  c.close();server.shutdown();raise SystemExit(0)
 results=[]
 for name in ['guarded_cancellation.json','missing_restriction.json']:
  request=json.loads((ROOT/'formal-verifier/fixtures'/name).read_text());request['policy']['max_seconds']=60
  result=page.evaluate('(request)=>browserRpc({op:"check",request})',request)
  results.append({'name':name,'result':result});print(name,result['status'],result.get('message'),flush=True)
 if '--lesson-refs' in sys.argv:
  for row in json.loads((BASE/'lesson-references.json').read_text()):
   spec=row['spec'];message={'op':'check_reference_text','request_id':'rollout:'+row['skill'],**spec['statement'],'allowed_rules':spec['allowed_rules'],'reference_steps':spec['reference_proof']['steps'],'max_seconds':60}
   result=page.evaluate('(message)=>browserRpc(message)',message)
   assert result['verification']['status']=='verified',(row['skill'],result['verification'])
   assert result['verification']['certificate']['proof_mode']=='reference'
   print(row['skill'],'reference verified',flush=True);results.append({'name':row['skill'],'result':result})
 (BASE/'backend.json').write_text(json.dumps(results,indent=2))
 assert results[0]['result']['status']=='verified' and results[0]['result']['certificate']
 assert results[1]['result']['status']!='verified' and not results[1]['result'].get('certificate')
 page.evaluate('()=>disposeFormal()');c.close()
server.shutdown()
