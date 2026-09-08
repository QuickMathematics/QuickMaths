import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createQuickMathsStore, STORAGE_KEY } from './challenge-core.js';
import { sameWorkspace, preserveDeviceState } from './workspace-merge.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const curriculum = read('./curriculum-data.json');
const pack = read('./lesson-depot/lessons/estimation-lab/1.0.0/lesson-set.json');
const skillId = pack.skills[0].id;
function setup() {
 const values = new Map();
 const storage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) };
 return { storage, store: createQuickMathsStore({curriculum, storage}) };
}
const visible = store => store.snapshot().curriculum.allSkills.some(skill => skill.id === skillId);

test('installing a pack enables only its installer; other existing and new profiles opt in', () => {
 const {store,storage} = setup();
 const alice = store.createProfile('Alice');
 const bob = store.createProfile('Bob');
 store.selectProfile(alice.id);
 store.importLessonPack(JSON.stringify(pack));
 assert.equal(visible(store),true);
 store.selectProfile(bob.id);
 assert.equal(visible(store),false);
 assert.ok(store.snapshot().lessonPacks.some(item => item.id === pack.id));
 assert.ok(!store.snapshot().curriculum.lessonPacks.some(item=>item.id===pack.id));
 assert.notEqual(store.snapshot().selectedSkill.id,skillId);
 assert.throws(()=>store.startTest(skillId));
 store.setProfilePackEnabled(pack.id,true);
 assert.equal(visible(store),true);
 store.setProfilePackEnabled(pack.id,false);
 store.selectProfile(alice.id);
 assert.equal(visible(store),true);
 store.createProfile('Charlie');
 assert.equal(visible(store),false);
 const reloaded = createQuickMathsStore({curriculum,storage});
 assert.equal(visible(reloaded),false);
 reloaded.selectProfile(alice.id);
 assert.equal(visible(reloaded),true);
 reloaded.selectProfile(bob.id);
 assert.equal(visible(reloaded),false);
});

test('disabling a pack preserves completed progress and saved map work', () => {
 const {store,storage}=setup();const alice=store.createProfile('Alice');store.importLessonPack(JSON.stringify(pack));
 const raw=JSON.parse(store.exportSyncState());
 raw.progress[alice.id][skillId]={status:'mastered',masteryScore:95,attemptCount:3};
 storage.setItem(STORAGE_KEY,JSON.stringify(raw));
 const reloaded=createQuickMathsStore({curriculum,storage});
 const before=JSON.parse(reloaded.exportSyncState());
 reloaded.setProfilePackEnabled(pack.id,false);
 assert.equal(visible(reloaded),false);
 reloaded.setProfilePackEnabled(pack.id,true);
 assert.equal(reloaded.snapshot().allProgressRows.find(row=>row.id===skillId).masteryScore,95);
 assert.deepEqual(JSON.parse(reloaded.exportSyncState()).mapPlans,before.mapPlans);
});

test('collapsed branches belong to the selected profile and survive switching/reload', () => {
 const {store,storage}=setup();const alice=store.createProfile('Alice');
 store.setMapCollapsedBranches(['SUBJECT_MATH/Geometry']);
 const bob=store.createProfile('Bob');assert.deepEqual(store.snapshot().ui.mapCollapsedBranchIds,[]);
 store.setMapCollapsedBranches(['SUBJECT_MATH/Algebra']);
 store.selectProfile(alice.id);assert.deepEqual(store.snapshot().ui.mapCollapsedBranchIds,['SUBJECT_MATH/Geometry']);
 const reloaded=createQuickMathsStore({curriculum,storage});
 assert.deepEqual(reloaded.snapshot().ui.mapCollapsedBranchIds,['SUBJECT_MATH/Geometry']);
 reloaded.selectProfile(bob.id);assert.deepEqual(reloaded.snapshot().ui.mapCollapsedBranchIds,['SUBJECT_MATH/Algebra']);
});

test('legacy global settings migrate only to the previously active profile', () => {
 const {store,storage}=setup();const alice=store.createProfile('Alice');const bob=store.createProfile('Bob');
 store.selectProfile(alice.id);store.importLessonPack(JSON.stringify(pack));
 const raw=JSON.parse(store.exportSyncState());
 for(const profile of raw.profiles)delete profile.enabledPackIds;
 raw.ui={...raw.ui,mapCollapsedBranchIds:['SUBJECT_MATH/Geometry']};
 for(const key of Object.keys(raw.ui))if(/collapsed/i.test(key)&&key!=='mapCollapsedBranchIds')delete raw.ui[key];
 storage.setItem(STORAGE_KEY,JSON.stringify(raw));
 const migrated=createQuickMathsStore({curriculum,storage});
 assert.equal(visible(migrated),true);assert.deepEqual(migrated.snapshot().ui.mapCollapsedBranchIds,['SUBJECT_MATH/Geometry']);
 migrated.selectProfile(bob.id);assert.equal(visible(migrated),false);assert.deepEqual(migrated.snapshot().ui.mapCollapsedBranchIds,[]);
});

test('storage merge policy is synced workspace content while profile collapse maps stay local', () => {
 const {store,storage}=setup();const alice=store.createProfile('Alice');
 const before=store.exportSyncState();
 store.setStorageMergePolicy('agent-priority');
 const after=store.exportSyncState();
 assert.equal(JSON.parse(after).preferences.storageMergePolicy,'agent-priority');
 assert.equal(store.snapshot().preferences.storageMergePolicy,'agent-priority');
 assert.equal(sameWorkspace(before,after),false);
 store.setMapCollapsedBranches(['SUBJECT_MATH/Geometry']);
 const local=store.exportSyncState();
 const remote=JSON.parse(local);remote.preferences.storageMergePolicy='manual';remote.ui.mapCollapsedBranchIdsByProfile={};remote.ui.mapCollapsedBranchIds=[];
 const combined=JSON.parse(preserveDeviceState(JSON.stringify(remote),local));
 assert.equal(combined.preferences.storageMergePolicy,'manual');
 assert.deepEqual(combined.ui.mapCollapsedBranchIdsByProfile[alice.id],['SUBJECT_MATH/Geometry']);
 storage.setItem(STORAGE_KEY,JSON.stringify(combined));
 const reloaded=createQuickMathsStore({curriculum,storage});
 assert.equal(JSON.parse(reloaded.exportSyncState()).preferences.storageMergePolicy,'manual');
});
