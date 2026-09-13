"""Real companion → JS store → WebMCP → repair/unavailable integration.

Runs no fake verifier successes. With no Lean/Lake, the final check must remain
unavailable and mastery must remain untouched. Optional rendered HTML contains
real candidate obligations, not proof certificates. The separate browser test
covers the actual UI when the browser permits localhost navigation.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "formal-verifier" / "src"))
from quickmaths_formal.service import create_server, runtime_status

JS = r'''
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createQuickMathsStore } from './docs/challenge-core.js';
import { buildToolDefinitions } from './docs/webmcp-tools.js';
import { renderFormalWorkspace } from './docs/formal-proof-workspace.js';
let input=''; for await (const chunk of process.stdin) input+=chunk;
const {baseUrl, leanAvailable, outputDir}=JSON.parse(input);
const curriculum=JSON.parse(readFileSync('docs/curriculum-data.json'));
const pack=JSON.parse(readFileSync('examples/formal-proof-lab.lesson-set.json'));
const values=new Map();
const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
const store=createQuickMathsStore({curriculum,storage,formalOptions:{baseUrl}});
store.createProfile('Proof explorer'); store.completeTutorial({skipped:true});
store.importLessonPack(pack);
store.startTest('CUSTOM_PROOF_CANCEL',{force:true});
const q=store.snapshot().activeTest.problems[0].template_id;
const goal='(x^2 - 9)/(x - 3) = x + 3';
const tools=Object.fromEntries(buildToolDefinitions(store).map(t=>[t.name,t]));
await store.runFormalProof(q,'start');
await store.runFormalProof(q,'append',{claim:goal,rule:'field_identity',premises:[]});
await store.runFormalProof(q,'progress');
const gap=await tools.inspect_formal_proof.execute({question_id:q});
assert.equal(gap.assessment_eligible,false);
assert.ok(gap.obligations.some(o=>/nonzero|denominator/.test(o.code)),JSON.stringify(gap));
assert.deepEqual(gap.verified_step_ids,[]);
assert.ok(!JSON.stringify(gap).includes('reference_step_1'));
const question=gap.guidance_options.find(g=>g.kind==='nonzero_condition');
assert.ok(question,JSON.stringify(gap));
await tools.record_formal_guidance.execute({question_id:q,proof_revision:gap.proof_revision,guidance_id:question.id});
assert.equal(store.submitTest().ok,false);
function capture(name){
  if(!outputDir)return;
  const problem=store.snapshot().activeTest.problems[0];
  const view=store.getFormalWorkspace(q);
  writeFileSync(`${outputDir}/${name}.json`,JSON.stringify(view.tutor,null,2));
  writeFileSync(`${outputDir}/${name}.html`,renderFormalWorkspace({problem,...view}));
}
capture('formal-learning-obligation');
await store.runFormalProof(q,'edit',{stepId:'user_step_1'});
await store.runFormalProof(q,'append',{claim:'x - 3 != 0',rule:'sub_ne_zero_from_ne',premises:['h1']});
await store.runFormalProof(q,'append',{claim:goal,rule:'field_identity',premises:['user_step_1']});
await assert.rejects(tools.record_formal_guidance.execute({question_id:q,proof_revision:gap.proof_revision,guidance_id:question.id}),/changed/);
const complete=await store.runFormalProof(q,'verify');
const repaired=store.inspectFormalProof({questionId:q});
assert.ok(!repaired.obligations.some(o=>/nonzero|denominator/.test(o.code)),JSON.stringify(repaired));
if(!leanAvailable){
  assert.equal(complete.verification_status,'verification_unavailable');
  assert.equal(store.submitTest().ok,false);
  assert.equal(store.snapshot().attempts.length,0);
  assert.deepEqual(repaired.verified_step_ids,[]);
}else{
  // When a pinned toolchain is installed, this becomes a true success test.
  assert.equal(complete.assessment_eligible,true,JSON.stringify(complete));
  assert.equal(store.submitTest().ok,true);
}
capture('formal-learning-repaired');
console.log(JSON.stringify({status:'passed',transport:'real HTTP companion',lean_available:leanAvailable,
  missing_obligation:gap.obligations[0],socratic_question:question.question,final_status:complete.verification_status,
  checks:['native lesson pack import','real theorem parsing','missing denominator obligation','reference-free WebMCP projection',
    'bounded visible guidance','stale guidance rejection','in-place repair','exact proof check','no unavailable-kernel mastery']},null,2));
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    if args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=True)
    server = create_server(port=0, project_dir=ROOT / "formal-verifier")
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        config = {"baseUrl": f"http://127.0.0.1:{server.server_port}", "leanAvailable": runtime_status()["lean_available"],
                  "outputDir": str(args.output_dir.resolve()) if args.output_dir else None}
        subprocess.run(["node", "--input-type=module", "-e", JS], cwd=ROOT,
                       input=json.dumps(config), text=True, check=True, timeout=120)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == "__main__":
    main()
