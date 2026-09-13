"""Native-UI smoke test against the REAL local formal companion.

Requires Playwright and Chromium. This test injects only a lesson fixture, never
fake verifier successes. It exercises the no-Lean path when Lean is unavailable.
Run from the repo root: python scripts/test_formal_workspace_browser.py
"""
from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import sys
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "formal-verifier" / "src"))
from quickmaths_formal.service import create_server
from quickmaths_formal.verifier import LEAN_TOOLCHAIN, MATHLIB_REV


class QuietFiles(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def lesson_fixture():
    curriculum = json.loads((ROOT / "docs" / "curriculum-data.json").read_text())
    skill = next(row for row in curriculum["skills"] if row["id"] == "MATH_ARITH_001")
    skill.update(name="Why cancellation needs a reason", native_templates=[], question_count=1)
    problem = {
        **skill["problems"][0], "template_id": "PROOF_WORKSPACE_DEMO", "seed": 1, "values": {},
        "prompt": "For real x with x ≠ 3, prove that (x² − 9)/(x − 3) = x + 3. Keep the domain restriction visible.",
        "expected_answer": "x + 3", "answer_type": "expression", "grading_method": "symbolic_expression",
        "answer_metadata": {"type": "expression", "value": "x + 3"},
        "grading_metadata": {"method": "symbolic_expression"}, "solution_steps": [],
        "proof_spec": {
            "version": "0.1",
            "statement": {"declarations": ["x:real"], "assumptions": ["x != 3"], "goal": "(x^2 - 9)/(x - 3) = x + 3"},
            "allowed_rules": ["sub_ne_zero_from_ne", "field_identity", "eq_refl", "ring_identity"],
            "environment": {"backend": "lean4", "library": "mathlib", "toolchain": LEAN_TOOLCHAIN, "library_revision": MATHLIB_REV},
        },
    }
    skill["problems"] = [problem]
    return curriculum


def main():
    from playwright.sync_api import sync_playwright
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=ROOT / ".bridge-runtime" / "formal" / "workspace-browser")
    parser.add_argument("--browser-executable", type=Path, help="Explicit browser executable; omit to use Playwright's installed browser.")
    parser.add_argument("--browser-channel", help="Playwright browser channel, for example chrome or msedge.")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    curriculum = lesson_fixture()
    files = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietFiles, directory=str(ROOT / "docs")))
    companion = create_server(port=8765, project_dir=ROOT / "formal-verifier")
    companion_base_url = f"http://127.0.0.1:{companion.server_port}"
    # Generate a valid local-first state through the store, not hand-built state.
    js = """
      import { createQuickMathsStore, STORAGE_KEY } from './docs/challenge-core.js';
      import { buildBoundFormalJob } from './docs/formal-binding.js';
      let input=''; for await (const c of process.stdin) input+=c;
      const {curriculum, baseUrl}=JSON.parse(input); const values=new Map();
      const skill=curriculum.skills.find(row=>row.id==='MATH_ARITH_001');
      for (const problem of skill.problems) problem.formal_job=buildBoundFormalJob({...problem,skill_id:skill.id});
      const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
      const store=createQuickMathsStore({curriculum,storage,formalOptions:{baseUrl}});
      store.createProfile('Proof explorer'); store.completeTutorial({skipped:true});
      store.startTest('MATH_ARITH_001');
      console.log(JSON.stringify({key:STORAGE_KEY,state:storage.getItem(STORAGE_KEY),curriculum}));
    """
    seeded = subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, input=json.dumps({"curriculum": curriculum, "baseUrl": companion_base_url}), capture_output=True, text=True, check=True)
    seed = json.loads(seeded.stdout)
    curriculum = seed.pop("curriculum")
    threads = [Thread(target=server.serve_forever, daemon=True) for server in [files, companion]]
    for thread in threads:
        thread.start()
    try:
        with sync_playwright() as pw:
            launch_options = {"headless": True, "args": ["--no-sandbox"]}
            if args.browser_executable:
                launch_options["executable_path"] = str(args.browser_executable)
            elif args.browser_channel:
                launch_options["channel"] = args.browser_channel
            browser = pw.chromium.launch(**launch_options)
            page = browser.new_page(viewport={"width": 1440, "height": 1100})
            page.set_default_timeout(60_000)
            # Use the app's actual companion endpoint, including its CORS path.
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.route("**/curriculum-data.json*", lambda route: route.fulfill(json=curriculum))
            page.add_init_script(f"if (!localStorage.getItem({json.dumps(seed['key'])})) localStorage.setItem({json.dumps(seed['key'])}, {json.dumps(seed['state'])});")
            page.goto(f"http://127.0.0.1:{files.server_port}/#/test/MATH_ARITH_001", wait_until="networkidle")
            panel = page.locator("[data-formal-proof-panel]")
            try:
                panel.wait_for()
            except Exception as exc:
                diagnostic = {
                    "error": str(exc),
                    "url": page.url,
                    "page_errors": errors,
                    "body": page.locator("body").inner_text(),
                    "startup_error": page.locator("#loading-screen").text_content(),
                }
                (args.output_dir / "browser-failure.json").write_text(json.dumps(diagnostic, indent=2), encoding="utf-8")
                page.screenshot(path=str(args.output_dir / "browser-failure.png"), full_page=True)
                raise
            panel.locator('[data-action="formal-start"]').click()
            try:
                panel.locator('[data-formal-field="claim"]').wait_for()
            except Exception:
                (args.output_dir / "connection-failure.txt").write_text(page.locator("body").text_content(), encoding="utf-8")
                raise
            goal = "(x^2 - 9)/(x - 3) = x + 3"
            def fill(claim, rule, premises=""):
                panel.locator('[data-formal-field="claim"]').fill(claim)
                panel.locator('[data-formal-field="rule"]').select_option(rule)
                panel.locator('[data-formal-field="premises"]').fill(premises)
            fill(goal, "field_identity")
            panel.locator('[data-action="formal-add-step"]').click()
            page.wait_for_function("() => document.querySelectorAll('[data-proof-step]').length === 1 && !document.querySelector('[data-action=\"formal-check-progress\"]').disabled")
            panel.locator('[data-action="formal-check-progress"]').click()
            page.wait_for_function("() => !document.querySelector('[data-action=\"formal-check-progress\"]').disabled")
            assert "nonzero" in panel.inner_text().lower()
            assert panel.locator(".kernel-verified").count() == 0
            panel.screenshot(path=str(args.output_dir / "workspace-obligation-desktop.png"))
            panel.locator('[data-action="formal-edit-step"]').first.click()
            fill("x - 3 != 0", "sub_ne_zero_from_ne", "h1")
            panel.locator('[data-action="formal-add-step"]').click()
            page.wait_for_function("() => !document.querySelector('.proof-edit-notice')")
            assert panel.locator('[data-proof-step="user_step_1"]').count() == 1
            fill(goal, "field_identity", "user_step_1")
            panel.locator('[data-action="formal-add-step"]').click()
            page.wait_for_function("() => document.querySelectorAll('[data-proof-step]').length === 2 && !document.querySelector('[data-action=\"formal-verify\"]').disabled")
            panel.locator('[data-action="formal-check-progress"]').click()
            page.wait_for_function("() => !document.querySelector('[data-action=\"formal-check-progress\"]').disabled")
            if shutil.which("lake") is None and shutil.which("lean") is None:
                assert "Lean unavailable" in panel.inner_text()
                assert panel.locator(".kernel-verified").count() == 0
                panel.locator('[data-action="formal-verify"]').click()
                page.wait_for_function("() => !document.querySelector('[data-action=\"formal-verify\"]').disabled")
                assert "Lean is unavailable" in panel.inner_text()
            else:
                panel.locator('[data-action="formal-verify"]').click()
                page.locator("[data-formal-proof-panel].verified").wait_for()
                assert panel.locator(".kernel-verified").count() == 2
            panel.screenshot(path=str(args.output_dir / "workspace-repaired-desktop.png"))
            # Offline edits stay editable, survive failed save + reload, and
            # never resurrect an earlier green badge or final receipt.
            panel.locator('[data-action="formal-edit-step"]').first.click()
            fill("x = x", "eq_refl")
            page.route("**/v1/rpc", lambda route: route.abort())
            panel.locator('[data-action="formal-add-step"]').click()
            page.wait_for_function("() => !document.querySelector('[data-action=\"formal-add-step\"]').disabled")
            assert panel.locator('[data-formal-field="claim"]').input_value() == "x = x"
            page.reload(wait_until="networkidle")
            assert panel.locator('[data-formal-field="claim"]').input_value() == "x = x"
            assert panel.locator('[data-action="formal-verify"]').is_disabled()
            assert panel.locator(".kernel-verified").count() == 0
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_timeout(150)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            panel.screenshot(path=str(args.output_dir / "workspace-mobile.png"))
            assert not errors, errors
            browser.close()
        print(json.dumps({"status": "passed", "verifier": "real local companion", "lean_available": bool(shutil.which("lake") or shutil.which("lean")), "checks": ["native lesson workspace", "missing nonzero obligation", "in-place repair", "dependent step retained", "complete kernel verification or explicit unavailable state", "offline edit survives reload and withdraws verification", "mobile overflow", "no page errors"], "screenshots": str(args.output_dir)}, indent=2))
    finally:
        for server in [files, companion]:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
