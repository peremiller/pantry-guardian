export const clone = value => structuredClone(value);
export async function timedFetch(url,options={},timeout=8000,fetcher=fetch){
 const controller=new AbortController();let timer;
 try{return await Promise.race([fetcher(url,{...options,signal:controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Connection timed out; saved local records remain available.'));},timeout);})]);}finally{clearTimeout(timer);}
}
export function canonical(value) {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
const versionOf=workspace=>Number.isInteger(workspace?.localVersion)?workspace.localVersion:workspace?.sequence||0;
export function emptyWorkspace(owner,state){
 return {schema:1,owner,state:clone(state),baseRevision:null,baseState:null,outbox:null,conflict:null,localConflict:null,backups:[],drafts:{},sequence:0,localVersion:0};
}
export function editWorkspace(workspace,state,operationId){
 const next=clone(workspace);next.state=clone(state);next.sequence++;next.localVersion=versionOf(workspace)+1;
 if(next.owner!=='guest')next.outbox={id:operationId,sequence:next.sequence,state:clone(state)};
 return next;
}
// Runs inside the same read/write transaction that reads and replaces the row.
// A stale UI cannot replace the newest state or put its candidate into the cloud
// outbox. Both full copies remain durable until an explicit local decision.
export function compareAndEdit(workspace,state,expectedVersion,operationId,clientId){
 if(!Number.isInteger(expectedVersion))throw Error('Open the saved workspace before editing.');
 if(canonical(workspace.state)===canonical(state))return clone(workspace);
 if(workspace.localConflict||expectedVersion!==versionOf(workspace)){
  const next=clone(workspace);
  if(!next.localConflict)next.localConflict={id:operationId,kind:'local-tabs',newestVersion:versionOf(workspace),newestState:clone(workspace.state),candidates:[],createdAt:new Date().toISOString()};
  const candidates=next.localConflict.candidates;
  if(!candidates.some(candidate=>canonical(candidate.state)===canonical(state)))candidates.push({id:operationId,clientId,expectedVersion,state:clone(state),drafts:clone(workspace.drafts||{}),createdAt:new Date().toISOString()});
  return next;
 }
 return editWorkspace(workspace,state,operationId);
}
export function receiveSnapshot(workspace,remote,sentId=null){
 if(remote.owner!==workspace.owner||workspace.owner==='guest')throw Error('Account changed. Local data was not uploaded or moved.');
 const next=clone(workspace);if(remote.reference)next.reference=clone(remote.reference);
 if(next.localConflict){
  // An upload already in flight may finish after another tab raises a local
  // conflict. Acknowledge only its matching newest copy; never touch candidates.
  if(sentId&&next.outbox?.id===sentId&&canonical(next.state)===canonical(remote.state)){
   next.outbox=null;next.baseRevision=remote.revision;next.baseState=clone(remote.state);
  }
  return next;
 }
 const previous=canonical(next.state);
 if(sentId&&next.outbox?.id===sentId||!next.outbox||previous===canonical(remote.state)){
  next.state=clone(remote.state);next.outbox=null;next.conflict=null;
 }else if(!sentId&&next.baseRevision!==remote.revision){next.conflict=clone(remote);return next;}
 next.baseRevision=remote.revision;next.baseState=clone(remote.state);
 if(canonical(next.state)!==previous)next.localVersion=versionOf(workspace)+1;
 return next;
}
export function resolveWorkspace(workspace,choice,operationId){
 if(workspace.localConflict)throw Error('Resolve the two local copies before account synchronization.');
 if(!workspace.conflict)throw Error('There is no saved account conflict.');
 const next=clone(workspace),remote=next.conflict;
 next.backups.push({at:new Date().toISOString(),local:clone(next.state),online:clone(remote.state),localDrafts:clone(next.drafts||{})});
 next.baseRevision=remote.revision;next.baseState=clone(remote.state);next.conflict=null;next.localVersion=versionOf(workspace)+1;
 if(choice==='local')next.outbox={id:operationId,sequence:++next.sequence,state:clone(next.state)};
 else if(choice==='online'){next.state=clone(remote.state);next.outbox=null;next.drafts={};}
 else throw Error('Choose local or online; both copies are retained in backups.');
 return next;
}
export function resolveLocalWorkspace(workspace,choice,candidateIndex,operationId,conflictId){
 const conflict=workspace.localConflict;
 if(!conflict||conflictId&&conflict.id!==conflictId)throw Error('The local conflict changed. Open the current saved copy and review it again.');
 const next=clone(workspace);
 next.backups.push({kind:'local-tabs',at:new Date().toISOString(),newest:clone(next.state),candidates:clone(conflict.candidates),localDrafts:clone(next.drafts||{})});
 if(choice==='candidate'){
  const index=candidateIndex<0?conflict.candidates.length-1:candidateIndex,candidate=conflict.candidates[index];
  if(!candidate)throw Error('Choose a retained local candidate.');
  next.state=clone(candidate.state);next.drafts=clone(candidate.drafts||{});next.sequence++;
  next.outbox=next.owner==='guest'?null:{id:operationId,sequence:next.sequence,state:clone(next.state)};
 }else if(choice!=='newest')throw Error('Choose the newest copy or a retained candidate.');
 next.localConflict=null;next.localVersion=versionOf(workspace)+1;return next;
}
export function openStore(indexedDB,name){
 return new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('workspaces',{keyPath:'owner'});
  request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);
 });
}
export function transact(db,owner,change){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('workspaces',change?'readwrite':'readonly'),store=tx.objectStore('workspaces');let value;
  tx.oncomplete=()=>resolve(clone(value));tx.onabort=()=>reject(tx.error||Error('Local save was interrupted.'));
  tx.onerror=()=>reject(tx.error||Error('Local storage is unavailable.'));
  const read=store.get(owner);read.onsuccess=()=>{try{value=change?change(read.result):read.result;if(change)store.put(value);}catch(error){tx.abort();reject(error);}};
 });
}
export class WorkspaceClient {
 constructor({db,owner='guest',initial,fetcher=fetch,endpoint='/api/offline/workspace',changed=(_workspace,_kind)=>{},external=(_event)=>{}}){
  Object.assign(this,{db,owner,initial,fetcher,endpoint,changed,external});this.generation=0;this.running=false;this.clientId=crypto.randomUUID();this.versions=new Map();
  if(typeof window!=='undefined'&&typeof window.BroadcastChannel==='function'){
   this.channel=new window.BroadcastChannel('local-workspace:'+db.name);
   this.channel.onmessage=event=>{if(event.data?.owner===this.owner&&event.data?.sender!==this.clientId)this.external(event.data);};
  }
 }
 remember(value){if(value)this.versions.set(value.owner,versionOf(value));return value;}
 emit(value,kind){this.remember(value);if(value.owner===this.owner)this.changed(value,kind);this.channel?.postMessage({owner:value.owner,sender:this.clientId,localVersion:versionOf(value)});return value;}
 async select(owner){this.generation++;this.owner=owner;return this.ensure();}
 async ensure(){const owner=this.owner;return this.remember(await transact(this.db,owner,value=>value?{...value,localVersion:versionOf(value),localConflict:value.localConflict||null}:emptyWorkspace(owner,this.initial())));}
 async read(){return this.remember(await transact(this.db,this.owner));}
 async edit(state,expectedOwner=this.owner,expectedVersion=this.versions.get(expectedOwner)){
  if(this.owner!==expectedOwner)throw Error('Account changed; edit was not moved.');
  const value=await transact(this.db,expectedOwner,old=>compareAndEdit(old||emptyWorkspace(expectedOwner,this.initial()),state,expectedVersion,crypto.randomUUID(),this.clientId));
  return this.emit(value,'local');
 }
 async draft(name,value,expectedOwner=this.owner){
  if(this.owner!==expectedOwner)throw Error('Account changed; draft was not moved.');
  return transact(this.db,expectedOwner,old=>({...old,drafts:{...(old.drafts||{}),[name]:clone(value)}}));
 }
 async resolve(choice,expectedOwner=this.owner,expectedVersion=this.versions.get(expectedOwner)){
  if(this.owner!==expectedOwner)throw Error('Account changed; conflict decision was not moved.');
  const value=await transact(this.db,expectedOwner,old=>{if(versionOf(old)!==expectedVersion)throw Error('Another tab changed this copy. Open it again before deciding.');return resolveWorkspace(old,choice,crypto.randomUUID());});
  return this.emit(value,'resolution');
 }
 /** @param {string|null} conflictId */
 async resolveLocal(choice,candidateIndex=-1,expectedOwner=this.owner,conflictId=null){
  if(this.owner!==expectedOwner)throw Error('Account changed; local conflict decision was not moved.');
  const value=await transact(this.db,expectedOwner,old=>resolveLocalWorkspace(old,choice,candidateIndex,crypto.randomUUID(),conflictId));return this.emit(value,'resolution');
 }
 async sync(){
  if(this.running&&this.runningGeneration===this.generation||this.owner==='guest')return;this.running=true;this.runningGeneration=this.generation;
  const owner=this.owner,generation=this.generation,current=()=>this.owner===owner&&this.generation===generation;
  try{
   const stored=await transact(this.db,owner);if(!current())return;if(stored?.localConflict){this.emit(stored,'conflict');return;}
   const response=await timedFetch(this.endpoint,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}},8000,this.fetcher);
   if(!response.ok){const problem=await response.json().catch(()=>({}));throw Error(problem.error||(response.status===401?'Sign in online to sync this account.':'Account sync is unavailable. Your work remains saved on this device.'));}
   const remote=await response.json();if(!current())return;if(remote.owner!==owner)throw Error('A different account is signed in. Switch workspaces before syncing.');
   let workspace=await transact(this.db,owner,old=>receiveSnapshot(old,remote));if(!current())return;this.emit(workspace,'remote');
   if(workspace.localConflict||workspace.conflict||!workspace.outbox)return;
   const sent=workspace.outbox;
   const uploaded=await timedFetch(this.endpoint,{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({owner,baseRevision:workspace.baseRevision,operationId:sent.id,state:sent.state})},10000,this.fetcher);
   const result=await uploaded.json();if(!current())return;
   if(!uploaded.ok&&uploaded.status!==409)throw Error(result.error||'Sync was not confirmed; local changes remain pending.');
   if(result.owner!==owner)throw Error('Account changed. Synchronization stopped.');
   if(uploaded.status===409){workspace=await transact(this.db,owner,old=>({...old,conflict:clone(result)}));this.emit(workspace,'remote');return;}
   workspace=await transact(this.db,owner,old=>receiveSnapshot(old,result,sent.id));if(current())this.emit(workspace,'remote');
  }finally{if(this.runningGeneration===generation)this.running=false;}
 }
 close(){this.channel?.close();}
}
