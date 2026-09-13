"""Measure incremental browser private memory against a running QuickMaths map.

Cache body bytes are exact Cache API payload sizes. USS is private resident
memory; Windows private commit and summed RSS are separately labelled.
"""
import argparse
import functools
import hashlib
import http.server
import json
import os
import platform
from datetime import datetime, timezone
from pathlib import Path
import statistics
import shutil
import subprocess
import threading
import time
from urllib.parse import urlsplit
from urllib.parse import quote
import psutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'.bridge-runtime/lean-browser-next'
parser=argparse.ArgumentParser()
parser.add_argument('--browser',choices=['chromium','firefox','webkit'],default='chromium')
parser.add_argument('--initial-mb',type=int,default=128)
parser.add_argument('--repeat',type=int,default=2)
parser.add_argument('--label',default='minimal',help='Name for this distinct experiment result')
parser.add_argument('--assets',default='assets',help='Prepared asset directory below the ignored experiment directory')
parser.add_argument('--timeout',type=int,default=240,help='Overall diagnostic run budget in seconds')
parser.add_argument('--group',default='',help='One recorded corpus import group per fresh worker')
parser.add_argument('--suite',choices=['legacy','curated'],default='legacy')
parser.add_argument('--mode',choices=['modules','snapshot'],default='modules')
parser.add_argument('--fixture',help='One named canonical fixture for a clearly labelled diagnostic run')
parser.add_argument('--corpus-rounds',type=int,choices=range(1,6),default=1)
args=parser.parse_args()
if args.suite=='curated':BASE=ROOT/'.bridge-runtime/curated-formal'
if not args.label.replace('-','').isalnum():parser.error('Use a simple alphanumeric result label')
if args.group and not args.group.replace('-','').isalnum():parser.error('Use a recorded alphanumeric group id')
asset_root=(BASE/args.assets).resolve();asset_root.relative_to(BASE.resolve())
os.environ['TEMP']=os.environ['TMP']=str(BASE)
if 'LOCALAPPDATA' in os.environ:
    os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',str(Path(os.environ['LOCALAPPDATA'])/'ms-playwright'))
body_bytes=0
host_paths=[Path(__file__),Path(__file__).with_name('curated.js'),Path(__file__).with_name('curated.html'),
            Path(__file__).with_name('compatibility.js'),ROOT/'docs/formal-environment-loader.js',asset_root/'viability-worker.js']
def host_hashes():
    return {str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in host_paths if path.exists()}
class Files(http.server.SimpleHTTPRequestHandler):
    def translate_path(self,path):
        url=urlsplit(path).path
        if url.startswith('/app/'):
            base=ROOT/'docs';relative=url[5:] or 'index.html'
        elif url.startswith('/probe/assets/'):
            base=asset_root;relative=url[14:]
        else:
            base=Path(__file__).parent;relative=url.removeprefix('/probe/').lstrip('/') or 'viability.html'
        target=(base/relative).resolve();target.relative_to(base.resolve());return str(target)
    def end_headers(self):
        if self.path.startswith('/probe/'):
            self.send_header('Cross-Origin-Opener-Policy','same-origin')
            self.send_header('Cross-Origin-Embedder-Policy','require-corp')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'")
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def copyfile(self,source,outputfile):
        global body_bytes
        while True:
            data=source.read(1024*1024)
            if not data:break
            outputfile.write(data)
            if self.path.startswith('/probe/'):body_bytes+=len(data)
    def log_message(self,*unused):pass

js="""
import fs from 'node:fs';
import {createQuickMathsStore,STORAGE_KEY} from './docs/challenge-core.js';
const curriculum=JSON.parse(fs.readFileSync('./docs/curriculum-data.json','utf8'));
const values=new Map(); const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
const store=createQuickMathsStore({curriculum,storage});store.createProfile('Browser benchmark');store.completeTutorial({skipped:true});
console.log(JSON.stringify({key:STORAGE_KEY,state:storage.getItem(STORAGE_KEY)}));
"""
node=os.environ.get('NODE_BINARY') or shutil.which('node')
if not node:raise RuntimeError('Node.js is required to seed the real QuickMaths baseline')
seed=json.loads(subprocess.run([node,'--input-type=module','-e',js],cwd=ROOT,capture_output=True,text=True,check=True).stdout)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Files)
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
samples=[];sampling=True
def measure():
    while sampling:
        values=[]
        for child in psutil.Process().children(recursive=True):
            try:
                if any(token in child.name().lower() for token in ['chrome','headless_shell','firefox','webkit','minibrowser']):
                    m=child.memory_full_info();values.append({'pid':child.pid,'uss':getattr(m,'uss',None),'rss':m.rss,'privateCommit':getattr(m,'private',None)})
            except (psutil.NoSuchProcess,psutil.AccessDenied):pass
        samples.append({'at':time.monotonic(),'uss':sum(v['uss'] or 0 for v in values) if values and all(v['uss'] is not None for v in values) else None,
                        'rss':sum(v['rss'] for v in values),'privateCommit':sum(v['privateCommit'] or 0 for v in values),'processes':values})
        time.sleep(0.5)
thread=threading.Thread(target=measure,daemon=True);thread.start()
profile=BASE/'profiles'/(args.browser+'-'+str(int(time.time())))
results={'browser':args.browser,'initialMB':args.initial_mb,'baseline':'Actual native QuickMaths mastery map, fresh profile, default curriculum, no verifier',
         'hostSourceHashes':host_hashes(),
         'memoryMethod':'Sum of per-process USS (private resident pages); sample interval >=0.5 s, plus labelled RSS/private commit; only owned browser descendants',
         'executedAt':datetime.now(timezone.utc).isoformat(),
         'host':{'os':platform.platform(),'logicalCpus':psutil.cpu_count(),'physicalCpus':psutil.cpu_count(logical=False),'physicalMemoryBytes':psutil.virtual_memory().total},
         'runs':[]}
with sync_playwright() as pw:
    context=getattr(pw,args.browser).launch_persistent_context(str(profile),headless=True,viewport={'width':1440,'height':1000})
    page=context.pages[0]
    page.add_init_script('if(!localStorage.getItem('+json.dumps(seed['key'])+'))localStorage.setItem('+json.dumps(seed['key'])+','+json.dumps(seed['state'])+');')
    page.goto(origin+'/app/#/map',wait_until='networkidle')
    page.locator('#map-field-select').wait_for(state='visible')
    page.wait_for_timeout(3000)
    results['baselineTitle']=page.title();results['baselineUrl']=page.url
    baseline=samples[-5:]
    results['baselineMemory']={k:statistics.median([s[k] for s in baseline if s[k] is not None]) for k in ['uss','rss','privateCommit']}
    print('Baseline private resident bytes:',results['baselineMemory']['uss'],flush=True)
    groups=list(json.loads((asset_root/'viability.json').read_text())['profiles']) if args.group=='all' else [args.group]
    cases=[(group,index) for group in groups for index in range(args.repeat)]
    for group,index in cases:
        probe=context.new_page()
        entry='curated.html' if args.suite=='curated' else 'viability.html'
        probe.goto(origin+'/probe/'+entry+'?initialMB='+str(args.initial_mb)+'&group='+group+'&mode='+args.mode+'&rounds='+str(args.corpus_rounds)+('&fixture='+quote(args.fixture) if args.fixture else ''),wait_until='networkidle')
        probe.wait_for_function('() => typeof window.startProbe === "function"')
        start=time.monotonic();network_start=body_bytes
        probe.evaluate('() => { void window.startProbe(); }')
        last=''
        report={'done':False,'stages':[],'assessment_eligible':False,'certificate':None}
        try:
            while time.monotonic()-start<args.timeout:
                report=probe.evaluate('() => window.report')
                if report['stages']:
                    current=str(report['stages'][-1])
                    if current!=last:
                        print(current,flush=True);last=current
                        (BASE/(args.browser+'-'+args.label+'-'+str(args.initial_mb)+'.progress.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
                if report['done']:break
                probe.wait_for_timeout(500)
            probe.wait_for_timeout(3000)
        except Exception as error:
            report['browserFailure']=str(error)
            report['error']='Browser failed before completing this run'
        if not report['done'] and 'browserFailure' not in report:
            report['error']=f'Benchmark wall-clock budget exceeded ({args.timeout} seconds)'
            report['benchmarkTimedOut']=True
        end=time.monotonic();measured=[s for s in samples if start<=s['at']<=end]
        report['httpResponseBodyBytes']=body_bytes-network_start
        report['memoryMeasurement']={}
        for key in ['uss','rss','privateCommit']:
            vals=[s[key] for s in measured if s[key] is not None]
            report['memoryMeasurement'][key]={'peak':max(vals) if vals else None,'steady':statistics.median(vals[-5:]) if vals else None,
                'incrementalPeak':max(vals)-results['baselineMemory'][key] if vals else None,
                'incrementalSteady':statistics.median(vals[-5:])-results['baselineMemory'][key] if vals else None}
        report['runKind']=('cold' if group==groups[0] else 'new-environment-shared-cache') if index==0 else 'cached-new-worker'
        results['runs'].append(report)
        (BASE/(args.browser+'-'+args.label+'-'+str(args.initial_mb)+'.json')).write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
        try:
            probe.evaluate('() => window.stopProbe()');probe.close();page.wait_for_timeout(3000)
            report['afterWorkerDiscard']={key:statistics.median([s[key] for s in samples[-5:] if s[key] is not None])-results['baselineMemory'][key] for key in ['uss','rss','privateCommit']}
        except Exception:
            break
    context.close()
sampling=False;thread.join(timeout=5);server.shutdown()
results['profileLogicalFileBytes']=sum(p.stat().st_size for p in profile.rglob('*') if p.is_file())
results['samples']=samples
results['finalHostSourceHashes']=host_hashes()
results['hostSourcesChanged']=results['hostSourceHashes']!=results['finalHostSourceHashes']
destination=BASE/(args.browser+'-'+args.label+'-'+str(args.initial_mb)+'.json')
destination.write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
print('Saved',destination,flush=True)
