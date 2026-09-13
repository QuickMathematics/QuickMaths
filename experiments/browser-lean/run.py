"""Local browser measurement runner. All browser profiles and results stay on X:."""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import time
import psutil
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.bridge-runtime/lean-browser'
parser = argparse.ArgumentParser()
parser.add_argument('--browser', choices=['chromium','firefox','webkit'], default='chromium')
parser.add_argument('--plain', action='store_true')
parser.add_argument('--shim', action='store_true')
parser.add_argument('--core-only', action='store_true')
parser.add_argument('--cached', action='store_true')
parser.add_argument('--csp', action='store_true')
args = parser.parse_args()
os.environ['TEMP'] = os.environ['TMP'] = str(BASE)
os.environ['PLAYWRIGHT_BROWSERS_PATH'] = 'C:/Users/bozic/AppData/Local/ms-playwright'

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        relative = urlsplit(path).path.lstrip('/')
        base = BASE / 'assets' if relative.startswith('assets/') else Path(__file__).parent
        if relative.startswith('assets/'): relative = relative[7:]
        target = (base / (relative or 'index.html')).resolve()
        target.relative_to(base.resolve())
        return str(target)
    def end_headers(self):
        if args.csp:
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'")
        if not args.plain:
            self.send_header('Cross-Origin-Opener-Policy','same-origin')
            self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        self.send_header('Cache-Control','public, max-age=3600')
        super().end_headers()
    def log_message(self, *unused): pass

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
name=args.browser+('-plain' if args.plain else '-isolated')+('-shim' if args.shim else '')+('-core' if args.core_only else '')
if args.cached: name += '-cached'
if args.csp: name += '-csp'
with sync_playwright() as p:
    browser=getattr(p,args.browser).launch(headless=True)
    page=browser.new_page()
    page.on('console',lambda message: print(message.text,flush=True) if 'error' in message.text.lower() else None)
    query='?'+('&'.join(k for k,v in [('shim',args.shim),('coreOnly',args.core_only)] if v))
    started=time.monotonic()
    peak_rss=0
    peak_private=0
    page.goto('http://127.0.0.1:'+str(server.server_port)+'/'+query,wait_until='domcontentloaded')
    if args.cached:
        page.wait_for_function('() => window.report?.done === true',timeout=120000)
        started=time.monotonic()
        page.reload(wait_until='domcontentloaded')
    last=''
    try:
        while time.monotonic()-started<1200:
            report=page.evaluate('() => window.report || {}')
            memory=[]
            for child in psutil.Process().children(recursive=True):
                try:
                    if any(token in child.name().lower() for token in ['chrome','headless_shell','firefox','webkit','minibrowser']): memory.append(child.memory_info())
                except (psutil.NoSuchProcess,psutil.AccessDenied): pass
            peak_rss=max(peak_rss,sum(m.rss for m in memory))
            peak_private=max(peak_private,sum(getattr(m,'private',0) for m in memory))
            current=report.get('stages',[])
            if current and str(current[-1])!=last:
                last=str(current[-1]);print(last,flush=True)
                (BASE/(name+'.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
            if report.get('done'):break
            page.wait_for_timeout(1000)
    finally:
        report=page.evaluate('() => window.report || {}')
        report['wallSeconds']=time.monotonic()-started
        report['processMemory']={'peakSummedRssBytes':peak_rss or None,'peakSummedPrivateBytes':peak_private or None,'samplingSeconds':1,'scope':'owned browser process tree; RSS can double-count shared pages; private is committed, not resident'}
        (BASE/(name+'.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
        browser.close();server.shutdown()
    print('Saved '+str(BASE/(name+'.json')),flush=True)
