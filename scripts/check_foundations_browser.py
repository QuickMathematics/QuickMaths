"""Bounded UI smoke check for the twenty foundation lessons on desktop/mobile layouts.

Serve docs on localhost:8899 first. Uses an isolated ephemeral browser/profile;
never touches an existing user's app storage or GitHub connection.
"""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('QM_BROWSER_TEST_DIR','F:/QuickMathsTests/foundations'))
OUT.mkdir(parents=True,exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(OUT)
BASE=os.environ.get('QM_TEST_URL','http://127.0.0.1:8899/')
ids=json.loads((ROOT/'docs/test-support/foundations-roadmap.json').read_text())['lesson_ids']
seed="""async () => {
 const {createQuickMathsStore}=await import('./challenge-core.js');
 const curriculum=await(await fetch('./curriculum-data.json')).json();
 const store=createQuickMathsStore({curriculum,storage:localStorage});
 if(!store.snapshot().activeProfile){store.createProfile('Isolated foundation preview');store.completeTutorial({skipped:true});store.setLearningPreferences({progressionMode:'soft'});}
 return curriculum.skills.filter(s=>s.id.startsWith('MATH_')).length;
}"""
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 for name,viewport in [('desktop',{'width':1440,'height':1000}),('mobile',{'width':390,'height':844})]:
  context=browser.new_context(viewport=viewport)
  page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(BASE,wait_until='networkidle');assert page.evaluate(seed)==112
  # Leave the welcome route before reloading; it intentionally logs profiles out.
  page.goto(BASE+'#/lesson/'+ids[0],wait_until='domcontentloaded')
  page.reload(wait_until='networkidle')
  media_count=0
  for id in ids:
   print(name,id,flush=True)
   page.goto(BASE+'#/lesson/'+id,wait_until='domcontentloaded');page.reload(wait_until='domcontentloaded')
   page.wait_for_function('(id)=>document.querySelector("#lesson-select")?.value===id',arg=id)
   assert page.locator('.example-list > details').count()==10,(id,page.locator('.example-list > details').count(),page.locator('h1').all_text_contents())
   figures=page.locator('[data-lesson-media]')
   assert figures.count()>0,id
   for i in range(figures.count()):
    figure=figures.nth(i);figure.scroll_into_view_if_needed()
    image=figure.locator('img');image.wait_for(state='visible')
    image.evaluate('(img)=>img.decode()');assert image.evaluate('(img)=>img.naturalWidth>0'),id
    media_count+=1
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(name,id,'horizontal overflow')
   if id in ['MATH_ARITH_008','MATH_GEOM_005','MATH_RAD_002']:
    figures.first.scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{name}-{id}.png'))
  # Exercise the real assessment page with stored public-given Cartesian graphs.
  page.goto(BASE+'#/lesson/MATH_ALG_009',wait_until='domcontentloaded')
  page.locator('[data-action="start-test"][data-skill-id="MATH_ALG_009"]').click()
  page.locator('[data-question-diagram="cartesian"]').first.wait_for(state='attached')
  graphs=page.locator('[data-question-diagram="cartesian"]');assert graphs.count()==2
  graphs.first.scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{name}-proportion-assessment.png'))
  assert not errors,errors
  results.append({'layout':name,'lesson_pages':20,'loaded_media':media_count,'assessment_graphs':2,'page_errors':errors})
  context.close()
 browser.close()
(OUT/'browser-results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results))
