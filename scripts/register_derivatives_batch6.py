"""Register four derivative lessons without replacing concurrent curriculum work.

Dry-run by default. --apply updates only track.yaml and the existing count-test
fixtures after every guard succeeds. It does not export, publish, change lesson
content, or rewrite learner state. Run from an up-to-date review branch.
"""
from __future__ import annotations
import argparse,difflib,os,re,sys,tempfile
from pathlib import Path
import yaml

IDS=tuple(f'MATH_CALC_{i:03d}' for i in range(3,7))
TRACK='content/math/algebra_foundations/track.yaml'
TEST='docs/challenge-core.test.js'
class RegistrationError(ValueError):pass

def once(pattern,text,label):
 matches=list(re.finditer(pattern,text,re.S))
 if len(matches)!=1:raise RegistrationError(f'{label}: expected one recognized location; found {len(matches)}. Merge manually; no files changed.')
 return matches[0]

def table(text,name):
 p=rf'(const\s+{name}\s*=\s*(?:Object\.freeze\()?\{{)(.*?)(\}}\)?\s*;)'
 m=once(p,text,name);body=m.group(2)
 pairs=re.findall(r'\b(MATH_[A-Z0-9_]+)\s*:\s*(\d+)',body)
 if len({k for k,v in pairs})!=len(pairs):raise RegistrationError(name+': duplicate lesson keys')
 return m,{k:int(v) for k,v in pairs}

def increment(text,pattern,delta,label):
 m=once(pattern,text,label);value=int(m.group(2))
 return text[:m.start(2)]+str(value+delta)+text[m.end(2):]

def plan(track_text,test_text):
 track=yaml.safe_load(track_text)
 if not isinstance(track,dict) or not isinstance(track.get('skills'),list):raise RegistrationError('Unrecognized track structure')
 if len(set(track['skills']))!=len(track['skills']):raise RegistrationError('Duplicate track skills')
 ordinary_match,ordinary=table(test_text,'AUTHORED_MATH_SCENARIO_COUNTS')
 method_match,lengths=table(test_text,'assessmentLengths')
 flags=[id in track['skills'] for id in IDS]+[id in ordinary for id in IDS]+[id in lengths for id in IDS]
 if any(flags):
  if all(flags) and all(ordinary[id]==20 and lengths[id]==21 for id in IDS):return track_text,test_text,False
  raise RegistrationError('Partially registered or conflicting Batch 6 IDs. Resolve manually; no files changed.')
 # Preserve the other agent's current counts: add deltas, never replace with a baseline total.
 test_text=increment(test_text,r'(assert\.equal\(curriculum\.skills\.length,\s*)(\d+)(\s*\);)',4,'native lesson count')
 test_text=increment(test_text,r'(assert\.equal\(curriculum\.skills\.reduce\(\(count, skill\) => count \+ skill\.question_count, 0\),\s*)(\d+)(\s*\);)',84,'configured question sum')
 test_text=increment(test_text,r'(assert\.ok\(curriculum\.skills\.reduce\(\(count, skill\) => count \+ skill\.problems\.length, 0\) >\s*)(\d+)(\s*\);)',84,'bank lower bound')
 test_text=increment(test_text,r'(assert\.deepEqual\(state\.subjects\.map\(\(subject\) => \[subject\.id, subject\.skillIds\.length\]\), \[\["SUBJECT_MATH",\s*)(\d+)(\]\]\);)',4,'subject lesson count')
 test_text=increment(test_text,r'(assert\.equal\(Object\.values\(AUTHORED_MATH_SCENARIO_COUNTS\)\.reduce\(\(total, count\) => total \+ count, 0\),\s*)(\d+)(\s*\);)',80,'ordinary scenario sum')
 for name,value in [('AUTHORED_MATH_SCENARIO_COUNTS',20),('assessmentLengths',21)]:
  m,_=table(test_text,name);body=m.group(2).rstrip()
  if body and not body.endswith(','):body+=','
  body+='\n'+''.join(f'  {id}: {value},\n' for id in IDS)
  test_text=test_text[:m.start(2)]+body+test_text[m.end(2):]
 # Append within the YAML skills block, preserving all other bytes and entries.
 m=once(r'(?m)^skills:[ \t]*\r?\n(?P<body>(?:^[ \t]+[^\n]*\r?\n|^-[^\n]*\r?\n|^[ \t]*\r?\n)*)',track_text,'track skills block')
 body=m.group('body');indent='  ' if re.search(r'^  -',body,re.M) else ''
 addition=''.join(f'{indent}- {id}\n' for id in IDS)
 track_text=track_text[:m.end('body')]+addition+track_text[m.end('body'):]
 updated=yaml.safe_load(track_text)
 if updated['skills']!=track['skills']+list(IDS):raise RegistrationError('Track append did not preserve exact skill order')
 # Existing exits are preserved; the new final derivative lesson is an additional exit.
 if isinstance(track.get('exit_skills'),list) and IDS[-1] not in track['exit_skills']:
  m=once(r'(?m)^exit_skills:[ \t]*\r?\n(?P<body>(?:^[ \t]+[^\n]*\r?\n|^-[^\n]*\r?\n|^[ \t]*\r?\n)*)',track_text,'track exit block')
  indent='  ' if re.search(r'^  -',m.group('body'),re.M) else ''
  track_text=track_text[:m.end('body')]+f'{indent}- {IDS[-1]}\n'+track_text[m.end('body'):]
 expected={**track,'skills':track['skills']+list(IDS)}
 if isinstance(track.get('exit_skills'),list):expected['exit_skills']=track['exit_skills']+[IDS[-1]]
 if yaml.safe_load(track_text)!=expected:raise RegistrationError('Unrelated track content changed; merge manually')
 return track_text,test_text,True

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1]);p.add_argument('--apply',action='store_true');a=p.parse_args();root=a.repo.resolve()
 paths=[root/TRACK,root/TEST]
 try:
  before=[x.read_bytes() for x in paths]
  after_track,after_test,changed=plan(*(b.decode('utf-8') for b in before))
  if not changed:print('Batch 6 already registered; no changes.');return 0
  source=root/'content/math/algebra_foundations/skills';known={}
  for path in source.glob('*.yaml'):
   s=yaml.safe_load(path.read_text(encoding="utf-8"));sid=s.get('id')
   if sid in known:raise RegistrationError('Duplicate native source ID '+str(sid))
   known[sid]=s
  for sid in IDS:
   if sid not in known:raise RegistrationError('Apply the additive lesson patch first: missing '+sid)
   s=known[sid]
   if s['test']['question_count']!=21 or len(s['test']['questions'])!=21:raise RegistrationError('Unexpected source assessment size '+sid)
   for pre in s['prerequisites']:
    if pre not in known:raise RegistrationError(sid+' missing prerequisite '+str(pre))
  after=[after_track.encode(),after_test.encode()]
  for path,old,new in zip(paths,before,after):print(''.join(difflib.unified_diff(old.decode().splitlines(True),new.decode().splitlines(True),fromfile=str(path),tofile=str(path))))
  if not a.apply:print('DRY RUN only. Review the diff, record the integration task, then rerun with --apply.');return 0
  # Detect a concurrent edit before either write. Use replace rather than in-place
  # writes, and restore prior bytes if this local two-file update fails.
  if any(path.read_bytes()!=old for path,old in zip(paths,before)):raise RegistrationError('A shared file changed during preflight; retry after reviewing the other work.')
  backups=[Path(str(path)+'.before-derivatives-batch6') for path in paths]
  if any(x.exists() for x in backups):raise RegistrationError('Backup file already exists; inspect it before applying again.')
  for backup,old in zip(backups,before):backup.write_bytes(old)
  try:
   for path,new in zip(paths,after):
    fd,tmp=tempfile.mkstemp(prefix=path.name+'.',dir=path.parent)
    with os.fdopen(fd,'wb') as f:f.write(new)
    os.replace(tmp,path)
  except Exception:
   for path,old in zip(paths,before):path.write_bytes(old)
   raise
  print('Registered Batch 6. Original shared-file backups were kept. Run the canonical exporter and tests; nothing has been published.')
  return 0
 except (OSError,ValueError,KeyError,yaml.YAMLError) as e:print('Registration stopped: '+str(e),file=sys.stderr);return 1

if __name__=='__main__':raise SystemExit(main())
