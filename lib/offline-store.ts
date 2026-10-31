import {WorkspaceClient,openStore,transact,emptyWorkspace,timedFetch} from '../public/offline/core.mjs';
export const workspaceKeys=["pantry-foods","pantry-storage","pantry-smart","pantry-meal-plan","pantry-saved","pantry-donations","pantry-donation-drafts","pantry-ai-history","pantry-ai-image","pantry-ai-prompt","pantry-food-draft"] as const;
type Records=Record<string,string>;
type Saved={owner:string;state:{records:Records};localVersion:number;localConflict?:unknown;conflict?:unknown;outbox?:unknown};
const DATABASE='pantry-guardian:offline:v1';
const memory=new Map<string,string>();const pending=new Set<Promise<void>>();
let identityGeneration=0,scopeGeneration=0;
let initialization:Promise<WorkspaceClient>|undefined,client:WorkspaceClient|undefined,viewVersion=0,scheduled=false,lastError:Error|null=null;
let queue:Promise<void>=Promise.resolve(),writeSerial=0,syncTimer:ReturnType<typeof setTimeout>|undefined;
const unsavedScopes=new Map<string,{records:Records;version:number}>();
const local=(key:string)=>{try{return localStorage.getItem(key)}catch{return null}};
const notify=(name:string,detail:unknown)=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(name,{detail}));};
const currentRecords=():Records=>Object.fromEntries(memory);
function applySaved(value:Saved,refresh=true){memory.clear();for(const [key,text] of Object.entries(value.state.records||{}))if((workspaceKeys as readonly string[]).includes(key)&&typeof text==='string')memory.set(key,text);viewVersion=value.localVersion||0;if(refresh)notify('pantry-store-refresh',{});}
function changed(value:Saved,kind:string){
 if(!client||value.owner!==client.owner)return;
 if(value.localConflict){applySaved(value);notify('pantry-localstatus','Two local copies are retained. Account upload is paused until you choose.');}
 else if(kind==='local'){viewVersion=value.localVersion;}
 else if(!pending.size){applySaved(value);}
 notify('pantry-localstate',{workspace:value,kind});
 notify('pantry-save',{state:value.localConflict?'conflict':'saved'});
 clearTimeout(syncTimer);if(value.outbox&&!value.conflict&&!value.localConflict&&navigator.onLine!==false)syncTimer=setTimeout(()=>void syncScoped().catch(()=>{}),1000);
}
async function legacyRecords():Promise<Records>{
 const records:Records={};for(const key of workspaceKeys){const value=local(key);if(value!==null)records[key]=value;}
 try{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('pantry-guardian-offline',1),timer=setTimeout(()=>reject(Error('Earlier browser store is unavailable')),3000);request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});request.onsuccess=()=>{clearTimeout(timer);resolve(request.result)};request.onerror=()=>{clearTimeout(timer);reject(request.error)};});
  const values=await new Promise<Array<{key:string;value:string;updatedAt:number}>>((resolve,reject)=>{const request=db.transaction('records').objectStore('records').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});db.close();
  for(const row of values)if((workspaceKeys as readonly string[]).includes(row.key)&&typeof row.value==='string'&&(row.updatedAt>=Number(local(row.key+':updated')||0)||records[row.key]===undefined))records[row.key]=row.value;
 }catch{/* Original legacy data is retained; localStorage is a readable backup. */}
 return records;
}
async function verifiedOwner(){if(navigator.onLine===false)return null;const request=++identityGeneration;try{const response=await timedFetch('/api/offline/identity',{cache:'no-store',credentials:'same-origin'},3000);if(!response.ok)return null;const data=await response.json();return request===identityGeneration&&typeof data.owner==='string'?data.owner:null;}catch{return null;}}
async function initialize(){
 const db=await openStore(indexedDB,DATABASE),guest=await transact(db,'guest');
 if(!guest){const records=await legacyRecords();await transact(db,'guest',(old:Saved|undefined)=>old||emptyWorkspace('guest',{records}));}
 const identity=await verifiedOwner();let owner=local(DATABASE+':active')||'guest';if(identity!==null)owner=local(DATABASE+':prefer-guest')==='yes'?'guest':identity;
 client=new WorkspaceClient({db,owner,initial:()=>({records:{}}),changed,external:()=>notify('pantry-localstatus','Another tab changed the saved copy. A local version check protects your next edit.')});
 const saved=await client.ensure();applySaved(saved,false);localStorage.setItem(DATABASE+':active',owner);notify('pantry-localstate',{workspace:saved,kind:'opening'});
 return client;
}
export async function hydrateOfflineStore(){initialization??=initialize();await initialization;}
export async function getScopedClient(){await hydrateOfflineStore();return client!;}
export function readOfflineValue(key:string){return memory.get(key);}
export function writeOfflineValue(key:string,value:string,expectedOwner=client?.owner){
 if(client&&expectedOwner!==client.owner){const rejected=Promise.reject(Error('Account changed; the previous editor did not write into this workspace.'));void rejected.catch(()=>{});return rejected;}
 if(!(workspaceKeys as readonly string[]).includes(key)||typeof value!=='string')throw Error('Unsupported local pantry field.');
 memory.set(key,value);writeSerial++;notify('pantry-save',{state:'saving'});
 if(!scheduled){
  scheduled=true;let resolveBatch:()=>void,rejectBatch:(error:unknown)=>void;
  const batch=new Promise<void>((resolve,reject)=>{resolveBatch=resolve;rejectBatch=reject});pending.add(batch);void batch.catch(()=>{}).finally(()=>pending.delete(batch));
  queueMicrotask(()=>{
   scheduled=false;const records=currentRecords(),owner=client?.owner,serial=writeSerial;
   queue=queue.catch(()=>{}).then(async()=>{
    const current=await getScopedClient();if(current.owner!==owner)throw Error('The active account changed. Pending edits were not moved to another account.');
    const result=await current.edit({records},owner,viewVersion);lastError=null;
    if(!result.localConflict&&serial===writeSerial&&current.owner===owner)applySaved(result,false);
   }).then(()=>resolveBatch(),error=>{lastError=error instanceof Error?error:Error('Local save failed');notify('pantry-save',{state:'error'});notify('pantry-localstatus','Local save needs attention. Export a backup before closing this page.');rejectBatch(error)});
  });
  return batch;
 }
 return queue;
}
export async function flushOfflineWrites(){while(pending.size)await Promise.allSettled([...pending]);if(lastError)throw lastError;}
export async function refreshScopedIdentity(){await hydrateOfflineStore();const owner=await verifiedOwner();if(owner===null)return;const selected=local(DATABASE+':prefer-guest')==='yes'?'guest':owner;if(selected!==client!.owner)await selectScope(selected);}
async function selectScope(owner:string){
 const token=++scopeGeneration,current=await getScopedClient(),previous=current.owner;
 try{await flushOfflineWrites()}catch{unsavedScopes.set(previous,{records:currentRecords(),version:viewVersion});}
 if(token!==scopeGeneration)return current.read();
 const value=await current.select(owner);if(token!==scopeGeneration)return current.read();lastError=null;applySaved(value);localStorage.setItem(DATABASE+':active',owner);notify('pantry-localstate',{workspace:value,kind:'selection'});
 const unsaved=unsavedScopes.get(owner);if(unsaved){const restored=await current.edit({records:unsaved.records},owner,unsaved.version);unsavedScopes.delete(owner);changed(restored,'resolution');}
 return current.read();
}
export async function chooseScopedGuest(guest:boolean){
 await hydrateOfflineStore();let owner='guest';if(guest)localStorage.setItem(DATABASE+':prefer-guest','yes');else{const identity=await verifiedOwner();if(!identity||identity==='guest')throw Error('Sign in online before opening an account workspace.');owner=identity;localStorage.removeItem(DATABASE+':prefer-guest');}
 return selectScope(owner);
}
export async function syncScoped(){await hydrateOfflineStore();await flushOfflineWrites();await refreshScopedIdentity();try{await client!.sync()}catch(error){notify('pantry-localstatus',error instanceof Error?error.message:'Account sync is unavailable. Local work remains saved.');throw error;}}
export function exportWorkspace(){return {format:'pantry-guardian-backup',version:1,owner:client?.owner||'guest',exportedAt:new Date().toISOString(),records:currentRecords()};}
export function exportCurrentState(){return {records:currentRecords()};}
export async function importScopedState(state:{records:Records},owner:string,expectedVersion:number){const current=await getScopedClient();if(current.owner!==owner)throw Error('Account changed; backup was not imported.');const result=await current.edit(state,owner,expectedVersion);applySaved(result);notify('pantry-localstate',{workspace:result,kind:'import'});}
