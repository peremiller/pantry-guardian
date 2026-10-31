import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {openStore,transact,WorkspaceClient,emptyWorkspace,editWorkspace,receiveSnapshot,resolveWorkspace,timedFetch} from '../public/offline/core.mjs';
const initial=()=>({goals:[],incomes:[],reviews:[],currency:'PHP'});
async function fixture(owner='guest',fetcher){const name='offline-test-'+crypto.randomUUID(),db=await openStore(indexedDB,name),client=new WorkspaceClient({db,owner,initial,fetcher});await client.ensure();return {name,db,client};}
test('Real IndexedDB transactions persist guest records and drafts through closing/reopening without cloud upload',async()=>{
 const {name,db,client}=await fixture();await client.edit({...initial(),currency:'USD'});await client.draft('goal',{title:'Unsubmitted draft'});db.close();
 const reopened=await openStore(indexedDB,name),saved=await transact(reopened,'guest');assert.equal(saved.state.currency,'USD');assert.equal(saved.drafts.goal.title,'Unsubmitted draft');assert.equal(saved.outbox,null);reopened.close();
});
test('Account workspaces and pending outboxes remain isolated; changed session cannot upload another account',async()=>{
 let posts=0;const {db,client}=await fixture('account-a',async(_url,options)=>{if(options.method==='POST')posts++;return Response.json({owner:'account-b',state:initial(),revision:'other'});});
 await client.edit({...initial(),currency:'USD'});await assert.rejects(client.sync(),/different account/);assert.equal(posts,0);
 await client.select('account-b');assert.equal((await client.read()).state.currency,'PHP');assert.equal((await transact(db,'account-a')).outbox.state.currency,'USD');db.close();
});
test('A revision conflict keeps local and server copies; resolving either side retains both backups',()=>{
 const local=editWorkspace({...emptyWorkspace('a',initial()),baseRevision:'r1'},{...initial(),currency:'USD'},'operation-1');
 const remote={owner:'a',revision:'r2',state:{...initial(),currency:'EUR'}};
 const conflicted=receiveSnapshot(local,remote);assert.equal(conflicted.state.currency,'USD');assert.equal(conflicted.conflict.state.currency,'EUR');
 const online=resolveWorkspace(conflicted,'online','resolution-1');assert.equal(online.state.currency,'EUR');assert.equal(online.backups[0].local.currency,'USD');assert.equal(online.outbox,null);
 const mine=resolveWorkspace(conflicted,'local','resolution-2');assert.equal(mine.baseRevision,'r2');assert.equal(mine.outbox.state.currency,'USD');assert.equal(mine.backups[0].online.currency,'EUR');
});
test('A new edit made during a slow successful upload survives its acknowledgement and syncs against the new revision',async()=>{
 let release,started;const atPost=new Promise(r=>started=r),wait=new Promise(r=>release=r);let server=initial(),rev='r1',posts=0;
 const {db,client}=await fixture('a',async(_url,options)=>{
  if(options.method!=='POST')return Response.json({owner:'a',revision:rev,state:server});
  posts++;const sent=JSON.parse(options.body);started();await wait;assert.equal(sent.baseRevision,'r1');server=sent.state;rev='r2';return Response.json({owner:'a',revision:rev,state:server});
 });
 await client.sync();await client.edit({...initial(),currency:'USD'});const syncing=client.sync();await atPost;
 await client.edit({...initial(),currency:'EUR'});release();await syncing;
 const saved=await client.read();assert.equal(saved.state.currency,'EUR');assert.equal(saved.outbox.state.currency,'EUR');assert.equal(saved.baseRevision,'r2');assert.equal(posts,1);db.close();
});
test('Late network responses after selecting another workspace cannot move private state across accounts',async()=>{
 let release;const wait=new Promise(r=>release=r);const {db,client}=await fixture('a',async()=>{await wait;return Response.json({owner:'a',state:{...initial(),currency:'USD'},revision:'r1'});});
 const syncing=client.sync();await client.select('b');release();await syncing;assert.equal((await client.read()).owner,'b');assert.equal((await client.read()).state.currency,'PHP');assert.equal((await transact(db,'a')).baseRevision,null);db.close();
});
test('An edit or draft tied to a previous account is rejected after selection changes',async()=>{
 const {db,client}=await fixture('a');await client.select('b');
 await assert.rejects(client.edit({...initial(),currency:'USD'},'a'),/Account changed/);
 await assert.rejects(client.draft('form',{private:'old account'},'a'),/Account changed/);
 assert.equal((await client.read()).state.currency,'PHP');assert.deepEqual((await client.read()).drafts,{});db.close();
});
test('A reopened account restores its last snapshot and pending edit when the backend is unavailable',async()=>{
 const {name,db,client}=await fixture('a');await transact(db,'a',old=>receiveSnapshot(old,{owner:'a',state:{...initial(),currency:'USD'},revision:'r1'}));await client.read();await client.edit({...initial(),currency:'EUR'});db.close();
 const reopened=await openStore(indexedDB,name),offline=new WorkspaceClient({db:reopened,owner:'a',initial,fetcher:async()=>Response.json({error:'Backend unavailable'},{status:503})});
 await offline.ensure();await assert.rejects(offline.sync(),/Backend unavailable/);assert.equal((await offline.read()).state.currency,'EUR');assert.equal((await offline.read()).outbox.state.currency,'EUR');
 await offline.select('guest');assert.equal((await offline.read()).state.currency,'PHP');assert.equal((await transact(reopened,'a')).state.currency,'EUR');reopened.close();
});
test('A stalled backend request is bounded without deleting local data',async()=>{
 await assert.rejects(timedFetch('/api/offline/workspace',{},15,()=>new Promise(()=>{})),/timed out/);
});
test('Two independent clients cannot overwrite stale local snapshots; reopen preserves both and blocks cloud upload until resolution',async()=>{
 let server=initial(),serverRevision='r1',requests=0,posts=0;
 const fetcher=async(_url,options)=>{requests++;if(options.method==='POST'){posts++;const sent=JSON.parse(options.body);assert.equal(sent.baseRevision,serverRevision);server=sent.state;serverRevision='r2';}return Response.json({owner:'a',state:server,revision:serverRevision});};
 const {name,db,client:a}=await fixture('a',fetcher);await a.sync();
 const dbB=await openStore(indexedDB,name),b=new WorkspaceClient({db:dbB,owner:'a',initial,fetcher});await b.ensure();
 const aView=await a.read(),staleB=await b.read();
 await a.edit({...aView.state,currency:'USD'},'a',aView.localVersion);
 const conflict=await b.edit({...staleB.state,currency:'EUR'},'a',staleB.localVersion);
 assert.equal(conflict.state.currency,'USD');assert.equal(conflict.localConflict.newestState.currency,'USD');assert.equal(conflict.localConflict.candidates[0].state.currency,'EUR');assert.equal(conflict.outbox.state.currency,'USD');
 requests=0;await a.sync();await b.sync();assert.equal(requests,0);assert.equal(posts,0);
 db.close();dbB.close();
 const reopened=await openStore(indexedDB,name),c=new WorkspaceClient({db:reopened,owner:'a',initial,fetcher});await c.ensure();const saved=await c.read();
 assert.equal(saved.state.currency,'USD');assert.equal(saved.localConflict.candidates[0].state.currency,'EUR');await c.sync();assert.equal(requests,0);
 const chosen=await c.resolveLocal('candidate',0,'a',saved.localConflict.id);assert.equal(chosen.state.currency,'EUR');assert.equal(chosen.localConflict,null);assert.equal(chosen.backups[0].newest.currency,'USD');assert.equal(chosen.backups[0].candidates[0].state.currency,'EUR');
 await c.sync();assert.equal(posts,1);assert.equal((await c.read()).outbox,null);
 const again=await c.edit({...initial(),currency:'GBP'},'a',staleB.localVersion);assert.equal(again.state.currency,'EUR');assert.equal(again.localConflict.candidates[0].state.currency,'GBP');
 await assert.rejects(c.resolveLocal('newest',-1,'a',saved.localConflict.id),/conflict changed/);reopened.close();
});
test('Guest conflicts retain every candidate and never create an account outbox',async()=>{
 const {name,db,client:a}=await fixture(),dbB=await openStore(indexedDB,name),b=new WorkspaceClient({db:dbB,initial});await b.ensure();const stale=await b.read();
 await a.edit({...initial(),currency:'USD'});await b.edit({...initial(),currency:'EUR'},'guest',stale.localVersion);await b.edit({...initial(),currency:'GBP'},'guest',stale.localVersion);
 const saved=await b.read();assert.equal(saved.localConflict.candidates.length,2);const chosen=await b.resolveLocal('newest',-1,'guest',saved.localConflict.id);assert.equal(chosen.state.currency,'USD');assert.equal(chosen.outbox,null);assert.equal(chosen.backups[0].candidates.length,2);db.close();dbB.close();
});
