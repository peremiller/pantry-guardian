export const workspaceKeys = ["pantry-foods","pantry-storage","pantry-smart","pantry-meal-plan","pantry-saved","pantry-donations","pantry-donation-drafts","pantry-ai-history","pantry-ai-image","pantry-ai-prompt"] as const;
const memory = new Map<string,string>();
const pending=new Set<Promise<void>>();
export async function flushOfflineWrites(){while(pending.size)await Promise.allSettled([...pending])}
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Device database unavailable")),3000);
    const request=indexedDB.open("pantry-guardian-offline",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("records",{keyPath:"key"});
    request.onsuccess=()=>{clearTimeout(timer);resolve(request.result)};
    request.onerror=()=>{clearTimeout(timer);reject(request.error)};
    request.onblocked=()=>{clearTimeout(timer);reject(new Error("Close other pantry tabs to update storage"))};
  });
  return database;
}
function localGet(key:string){try{return localStorage.getItem(key)}catch{return null}}
export function readOfflineValue(key:string){return memory.get(key)??localGet(key)}
export async function hydrateOfflineStore(){
  try{
    const db=await openDatabase();
    const records=await new Promise<Array<{key:string;value:string;updatedAt:number}>>((resolve,reject)=>{
      const request=db.transaction("records").objectStore("records").getAll();
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    for(const record of records){const timestamp=Number(localGet(`${record.key}:updated`)||0);if(record.updatedAt>=timestamp||!localGet(record.key))memory.set(record.key,record.value)}
  }catch{/* Existing browser storage remains usable if IndexedDB is unavailable. */}
}
export function writeOfflineValue(key:string,value:string){
  memory.set(key,value);
  const updatedAt=Date.now();let mirrored=false;
  try{localStorage.setItem(key,value);localStorage.setItem(`${key}:updated`,String(updatedAt));mirrored=true}catch{/* The database can hold larger photo collections. */}
  window.dispatchEvent(new CustomEvent("pantry-save",{detail:{state:"saving"}}));
  const saving=(async()=>{
    let databaseSaved=false;
    try{const db=await openDatabase();await new Promise<void>((resolve,reject)=>{const tx=db.transaction("records","readwrite");tx.objectStore("records").put({key,value,updatedAt});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});databaseSaved=true}catch{}
    window.dispatchEvent(new CustomEvent("pantry-save",{detail:{state:databaseSaved||mirrored?"saved":"error"}}));
  })();
  pending.add(saving);void saving.finally(()=>pending.delete(saving));return saving;
}
export function exportWorkspace(){return {format:"pantry-guardian-backup",version:1,exportedAt:new Date().toISOString(),records:Object.fromEntries(workspaceKeys.map(key=>[key,readOfflineValue(key)]).filter(([,value])=>value!==null))}}
