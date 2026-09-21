"""Isolated desktop/mobile UI smoke for the four derivative lessons.
Serve docs on localhost:8899; this does not alter a real learner profile.
Kernel verification is separately exercised by check_derivatives_batch6_references.py.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('QM_BROWSER_TEST_DIR','F:/QuickMathsTests/derivatives-batch6'))
OUT.mkdir(parents=True,exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(OUT)
BASE=os.environ.get('QM_TEST_URL','http://127.0.0.1:8899/')
IDS=[f'MATH_CALC_{i:03d}' for i in range(3,7)]
seed="""async () => {
 const {createQuickMathsStore}=await import('./challenge-core.js');
 const curriculum=await(await fetch('./curriculum-data.json')).json();
 const store=createQuickMathsStore({curriculum,storage:localStorage});
 store.createProfile('Isolated derivative preview');store.completeTutorial({skipped:true});store.setLearningPreferences({progressionMode:'soft'});
}"""
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 for layout,viewport in [('desktop',{'width':1440,'height':1000}),('mobile',{'width':390,'height':844})]:
  for sid in IDS:
   context=browser.new_context(viewport=viewport);page=context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(BASE,wait_until='networkidle');page.evaluate(seed)
   page.goto(BASE+'#/lesson/'+sid);page.reload(wait_until='networkidle')
   page.wait_for_function('(id)=>document.querySelector("#lesson-select")?.value===id',arg=sid)
   assert page.locator('.example-list > details').count()==10
   figures=page.locator('[data-lesson-media]');assert figures.count()==2
   for figure in figures.all():
    figure.scroll_into_view_if_needed();figure.locator('img').evaluate('(i)=>i.decode()')
   figures.first.scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{layout}-{sid}-lesson.png'))
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   page.locator(f'[data-action="start-test"][data-skill-id="{sid}"]').click()
   page.locator('.question-card').first.wait_for();assert page.locator('.question-card').count()==21
   panel=page.locator('[data-formal-proof-panel]');assert panel.count()==1
   graphs=page.locator('[data-question-diagram="cartesian"]')
   for graph in graphs.all():
    graph.scroll_into_view_if_needed();assert graph.locator('svg').count()==1
   if graphs.count():
    graphs.first.scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{layout}-{sid}-graph.png'))
   panel.scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{layout}-{sid}-formal.png'))
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   assert not errors,errors
   results.append({'layout':layout,'skill':sid,'teaching_figures':2,'questions':21,'graphs':graphs.count(),'formal_panels':1,'errors':errors})
   print(json.dumps(results[-1]),flush=True);context.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
