"""Compare measured initialization peaks, separately from whole-run peaks."""
import argparse,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('baseline',type=Path);p.add_argument('candidate',type=Path);p.add_argument('--output',type=Path,required=True)
a=p.parse_args()
def summarize(path):
 d=json.loads(path.read_text());assert d['hostSourcesChanged'] is False
 rows=[]
 for r in d['runs']:
  boundary=next(s for s in r['stages'] if s.get('phase')=='staged-files-released')
  end=r['measurementStartMonotonic']+boundary['atMs']/1000
  samples=[s for s in d['samples'] if r['measurementStartMonotonic']<=s['at']<=end]
  peak=max(samples,key=lambda s:s['uss'])
  rows.append({'environment':r['selectedGroup'],'initializationIncrementalPrivatePeakBytes':peak['uss']-d['baselineMemory']['uss'],
   'peakAtMs':(peak['at']-r['measurementStartMonotonic'])*1000,'initializationBoundaryMs':boundary['atMs'],
   'wholeRunIncrementalPrivatePeakBytes':r['memoryMeasurement']['uss']['incrementalPeak'],
   'assessment_eligible':False,'certificate':None})
 return {'source':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rows':rows}
out={'method':'Owned Chromium process-tree USS above normal QuickMaths map baseline. Initialization window ends at staged-files-released diagnostic hold, before rejection controls or corpus execution. Includes explicitly instrumented idle holds. Desktop measurements, not Android process-memory readings.','baseline':summarize(a.baseline),'candidate':summarize(a.candidate)}
a.output.write_text(json.dumps(out,indent=2)+'\n')
for key in ['baseline','candidate']:
 print(key,[(r['environment'],round(r['initializationIncrementalPrivatePeakBytes']/2**20,1)) for r in out[key]['rows']])
