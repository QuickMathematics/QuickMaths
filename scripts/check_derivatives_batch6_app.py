"""Real submitted-proof and restored-draft verification for four Batch 6 lessons.
Synthetic learners only; uses the pinned HTTP companion and fresh certificates.
"""
import json, subprocess, sys
from pathlib import Path
from threading import Thread
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'formal-verifier/src'))
from quickmaths_formal.service import create_server, runtime_status

def main():
 if not runtime_status()['lean_available']:raise RuntimeError('Pinned Lean is required for this integration gate')
 server=create_server(port=0,project_dir=ROOT/'formal-verifier')
 thread=Thread(target=server.serve_forever,daemon=True);thread.start()
 try:
  subprocess.run(['node',str(ROOT/'scripts/check_derivatives_batch6_app.mjs')],cwd=ROOT,input=json.dumps({'baseUrl':f'http://127.0.0.1:{server.server_port}'}),text=True,check=True,timeout=420)
 finally:
  server.shutdown();server.server_close();thread.join(timeout=5)
if __name__=='__main__':main()
