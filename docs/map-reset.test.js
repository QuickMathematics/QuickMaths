import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createQuickMathsStore} from './challenge-core.js';
test('mastery map reset clears only the active profile map and keeps learning data',()=>{
 const curriculum=JSON.parse(readFileSync(new URL('./curriculum-data.json',import.meta.url),'utf8'));
 const store=createQuickMathsStore({curriculum,storage:{getItem:()=>null,setItem(){}}});
 const a=store.createProfile('Alice');store.updateMapPlanLayout({layoutKey:'all-subjects',positions:{MATH_ARITH_001:{x:400,y:500}}});
 const b=store.createProfile('Bob');store.updateMapPlanLayout({layoutKey:'all-subjects',positions:{MATH_ARITH_001:{x:600,y:800}}});
 store.addMapPlanAnnotation({body:'Reset me',skillIds:['MATH_ARITH_001']});store.createMapPlanPath({name:'Path',skillIds:['MATH_ARITH_001','MATH_ARITH_002'],color:'#123456'});store.setMapPlanNodesHidden(['MATH_ARITH_002']);store.setMapCollapsedBranches(['SUBJECT_MATH/Geometry']);
 const before=JSON.parse(store.exportSyncState());store.resetMasteryMap();const after=JSON.parse(store.exportSyncState());
 assert.deepEqual(after.mapPlans[a.id],before.mapPlans[a.id]);
 assert.deepEqual(after.mapPlans[b.id],{layouts:{},paths:[],annotations:[],hiddenSkillIds:[]});
 for(const key of ['progress','attempts','drafts','lessonPacks'])assert.deepEqual(after[key],before[key]);
 assert.deepEqual(store.snapshot().ui.mapCollapsedBranchIds,[]);
});
