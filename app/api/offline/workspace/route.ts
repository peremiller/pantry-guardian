import {accountOwner} from '@/lib/pantry-owner';
import {emptyState,validatePantry,revision,decidePantry} from '@/lib/pantry-sync.mjs';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
async function binding(){
 // The existing Vercel donation memory store is deliberately not used: it is
 // ephemeral and must never acknowledge a durable private account save.
 if(process.env.VERCEL)throw Error('Durable account storage is not configured on this deployment.');
 const {env}=await import('cloudflare:workers');const db=(env as unknown as {DB?:D1Database}).DB;
 if(!db)throw Error('A durable DB binding and workspace migration are required.');return db;
}
async function read(db:D1Database,owner:string){const row=await db.prepare('SELECT revision, state FROM pantry_offline_workspaces WHERE owner = ?').bind(owner).first<{revision:string;state:string}>();return row?{state:validatePantry(JSON.parse(row.state)),revision:row.revision,exists:true}:{state:emptyState(),revision:revision(emptyState()),exists:false};}
export async function GET(){const owner=await accountOwner();if(!owner)return json({error:'Sign in online to sync.'},401);try{const current=await read(await binding(),owner);return json({owner,state:current.state,revision:current.revision});}catch{return json({owner,error:'Durable account sync is unavailable on this deployment. Local records remain saved; pending changes are not discarded.'},503);}}
export async function POST(request:Request){
 const owner=await accountOwner();if(!owner)return json({error:'Sign in online to sync.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site'||!request.headers.get('content-type')?.startsWith('application/json'))return json({owner,error:'Same-origin JSON required.'},403);
 let payload:Record<string,unknown>;try{const raw=await request.text();if(raw.length>12000000)throw Error('Too large');payload=JSON.parse(raw);if(payload.owner!==owner)return json({owner,error:'Account changed; nothing was uploaded.'},403);if(typeof payload.operationId!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(payload.operationId))throw Error('Invalid operation');validatePantry(payload.state);}catch{return json({owner,error:'The local pantry copy is invalid or too large.'},400);}
 try{const db=await binding(),current=await read(db,owner),decision=decidePantry({owner,expectedOwner:payload.owner,current:current.state,state:payload.state,baseRevision:payload.baseRevision});
  if(decision.kind!=='apply')return json({owner,state:decision.state,revision:decision.revision},decision.kind==='conflict'?409:200);
  const statement=current.exists?db.prepare('UPDATE pantry_offline_workspaces SET state = ?, revision = ? WHERE owner = ? AND revision = ?').bind(JSON.stringify(decision.state),decision.revision,owner,current.revision):db.prepare('INSERT OR IGNORE INTO pantry_offline_workspaces (owner,state,revision) VALUES (?,?,?)').bind(owner,JSON.stringify(decision.state),decision.revision);
  const result=await statement.run();if(result.meta.changes!==1){const latest=await read(db,owner);return json({owner,state:latest.state,revision:latest.revision},409);}
  return json({owner,state:decision.state,revision:decision.revision});
 }catch{return json({owner,error:'Durable account save was not confirmed. The local outbox remains pending.'},503);}
}
