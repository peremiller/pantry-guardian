import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {openStore,WorkspaceClient,transact} from '../public/offline/core.mjs';
import {validatePantry,emptyState,revision,decidePantry} from '../lib/pantry-sync.mjs';

const food=name=>({id:1,name,location:'Countertop',quantity:'1',expiry:'2026-12-01'});
const records={'pantry-foods':JSON.stringify([food('Legacy cupboard')]),'pantry-storage':'{}','pantry-smart':'{}','pantry-meal-plan':'["Rice bowl"]','pantry-saved':'2','pantry-donations':'{"donations":[],"savedAt":"2026-10-30"}','pantry-donation-drafts':'[]','pantry-ai-history':'[]','pantry-ai-image':'','pantry-ai-prompt':'Unsubmitted question','pantry-food-draft':JSON.stringify({editingId:null,values:{name:'Unfinished food'},image:''})};
test('Pantry state validates all records and idempotent revisions reject stale and foreign updates',()=>{
 const state=validatePantry({records});assert.deepEqual(state.records,records);const changed={records:{...records,'pantry-saved':'3'}};
 assert.equal(decidePantry({owner:'a',expectedOwner:'a',current:state,state,baseRevision:'retry'}).kind,'already-applied');
 assert.equal(decidePantry({owner:'a',expectedOwner:'a',current:state,state:changed,baseRevision:'old'}).kind,'conflict');
 assert.equal(decidePantry({owner:'a',expectedOwner:'a',current:state,state:changed,baseRevision:revision(state)}).kind,'apply');
 assert.throws(()=>decidePantry({owner:'a',expectedOwner:'b',current:state,state,baseRevision:revision(state)}),/Account mismatch/);
 assert.throws(()=>validatePantry({records:{...records,'pantry-foods':JSON.stringify([food('A'),food('B')])}}),/Duplicate/);
 assert.throws(()=>validatePantry({records:{privateToken:'never copied'}}),/Unsupported/);
});
test('Actual UI store migrates all legacy keys, isolates accounts, and preserves stale tab edits through reload without uploading',async()=>{
 const storage=new Map(Object.entries({...records,'pantry-foods':JSON.stringify([food('Older mirror')]),'pantry-foods:updated':'10'}));
 globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
 globalThis.indexedDB=indexedDB;globalThis.window=new EventTarget();
 Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});
 const legacy=await new Promise((resolve,reject)=>{const r=indexedDB.open('pantry-guardian-offline',1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 await new Promise((resolve,reject)=>{const tx=legacy.transaction('records','readwrite');tx.objectStore('records').put({key:'pantry-foods',value:records['pantry-foods'],updatedAt:20});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});legacy.close();
 let requests=0,identity='account-a';globalThis.fetch=async url=>{requests++;if(url==='/api/offline/identity')return Response.json({owner:identity});return Response.json({error:'Durable sync unavailable'},{status:503})};
 const store=await import('../lib/offline-store.ts?first');await store.hydrateOfflineStore();
 assert.deepEqual(store.exportWorkspace().records,records);assert.equal(store.exportWorkspace().owner,'guest');
 navigator.onLine=true;await store.chooseScopedGuest(false);navigator.onLine=false;assert.deepEqual(store.exportWorkspace().records,{});
 const active=await store.getScopedClient(),otherDB=await openStore(indexedDB,'pantry-guardian:offline:v1'),other=new WorkspaceClient({db:otherDB,owner:'account-a',initial:emptyState});await other.ensure();
 const newest={records:{'pantry-foods':JSON.stringify([food('Newest other tab')])}};await other.edit(newest);
 await store.writeOfflineValue('pantry-foods',JSON.stringify([food('Stale UI candidate')]),'account-a');await store.flushOfflineWrites();
 const conflict=await active.read();assert.deepEqual(conflict.state,newest);assert.match(conflict.localConflict.candidates[0].state.records['pantry-foods'],/Stale UI candidate/);
 requests=0;await active.sync();await other.sync();assert.equal(requests,0,'unresolved local conflicts must block even GET/POST cloud synchronization');
 active.db.close();otherDB.close();const reloaded=await import('../lib/offline-store.ts?reload');await reloaded.hydrateOfflineStore();
 const reopened=await reloaded.getScopedClient(),persisted=await reopened.read();assert.equal(reopened.owner,'account-a');assert.deepEqual(persisted.state,newest);assert.match(persisted.localConflict.candidates[0].state.records['pantry-foods'],/Stale UI candidate/);
 const chosen=await reopened.resolveLocal('candidate',0,'account-a',persisted.localConflict.id);assert.match(chosen.state.records['pantry-foods'],/Stale UI candidate/);assert.deepEqual(chosen.backups[0].newest,newest);
 await reloaded.chooseScopedGuest(true);await assert.rejects(reloaded.writeOfflineValue('pantry-ai-prompt','old private editor','account-a'),/Account changed/);assert.equal(reloaded.readOfflineValue('pantry-ai-prompt'),records['pantry-ai-prompt']);
 assert.equal((await transact(reopened.db,'account-a')).outbox.state.records['pantry-foods'],chosen.state.records['pantry-foods']);reopened.db.close();
});
