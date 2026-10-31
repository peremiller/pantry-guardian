import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {localKitchenReply} from '../lib/offline-kitchen.mjs';
const source=await readFile(new URL('../scripts/offline-worker-template.js',import.meta.url),'utf8');
function harness({failPath,privatePath}={}){
 const origin='https://pantry.test',listeners={},stores=new Map();let disconnected=false,networkCalls=0;
 const key=request=>new URL(typeof request==='string'?request:request.url,origin).href;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {async match(request){return store.get(key(request))?.clone()},async put(request,response){store.set(key(request),response.clone())},async delete(request){return store.delete(key(request))}}},async keys(){return [...stores.keys()]},async delete(name){return stores.delete(name)},async match(request){for(const store of stores.values()){const saved=store.get(key(request));if(saved)return saved.clone()}}};
 class WorkerRequest extends Request{constructor(path,options){super(new URL(path,origin),options)}}
 const config={version:'test-build',routes:['/','/pantry','/recipes','/offline'],assets:['/_next/static/app.js','/app.css']};
 const context={CONFIG:config,crypto:webcrypto,caches,Request:WorkerRequest,Response,URL,console,self:{location:{origin},clients:{async matchAll(){return []},async claim(){}},async skipWaiting(){},addEventListener(type,callback){listeners[type]=callback}},async fetch(request){networkCalls++;const path=new URL(key(request)).pathname;if(disconnected||path===failPath)throw new Error('Connection unavailable');return new Response(`saved:${path}`,{headers:{'Content-Type':config.routes.includes(path)?'text/html':'text/javascript',...(path===privatePath?{'Cache-Control':'private, no-store'}:{})}})}};
 vm.runInNewContext(source,context);
 async function dispatch(type,data={}){const promises=[];let response;listeners[type]({...data,waitUntil(p){promises.push(p)},respondWith(p){response=Promise.resolve(p)}});await Promise.all(promises);return response&&await response}
 async function message(data){let reply;await dispatch('message',{data,ports:[{postMessage(value){reply=value}}]});return reply}
 return {config,caches,dispatch,message,offline(){disconnected=true},get networkCalls(){return networkCalls}};
}
test('all pages and assets launch with the actual network unavailable after installation',async()=>{
 const app=harness();await app.dispatch('install');let state=await app.message({type:'STATUS'});assert.equal(state.ready,true);assert.equal(state.pages,4);
 app.offline();const calls=app.networkCalls;
 for(const path of app.config.routes){const response=await app.dispatch('fetch',{request:{url:'https://pantry.test'+path,method:'GET',mode:'navigate'}});assert.equal(await response.text(),`saved:${path}`)}
 const asset=await app.dispatch('fetch',{request:new Request('https://pantry.test/_next/static/app.js')});assert.equal(await asset.text(),'saved:/_next/static/app.js');assert.equal(app.networkCalls,calls,'cached launches must not need a successful connection');
});
test('offline test mode blocks writes and can be ended without network access',async()=>{
 const app=harness();await app.dispatch('install');await app.message({type:'TEST_OFFLINE',value:true});const calls=app.networkCalls;
 const response=await app.dispatch('fetch',{request:new Request('https://pantry.test/api/donations',{method:'POST',body:'{}'})});assert.equal(response.status,503);assert.equal(app.networkCalls,calls);
 app.offline();const state=await app.message({type:'TEST_OFFLINE',value:false});assert.equal(state.testing,false);assert.equal(state.ready,true);
});
test('an interrupted first download never reports offline readiness',async()=>{
 const app=harness({failPath:'/recipes'});await assert.rejects(app.dispatch('install'));const state=await app.message({type:'STATUS'});assert.equal(state.ready,false);assert.equal(state.pages,2);
});
test('the local helper excludes expired food and does not claim image recognition',()=>{
 const foods=[{name:'Expired milk',quantity:'1 L',expiry:'2026-10-30',location:'Fridge'},{name:'Brown rice',quantity:'2 kg',expiry:'2026-11-02',location:'Cabinet'}];
 const answer=localKitchenReply(foods,'What can I cook?','recipes','2026-10-31');assert.match(answer,/Brown rice/);assert.doesNotMatch(answer,/• Expired milk/);assert.match(answer,/1 items have a past recorded date/);assert.match(localKitchenReply(foods,'Photo','vision'),/cannot recognize food/);
});

test('a missing cached asset removes readiness until it can be downloaded again',async()=>{const app=harness();await app.dispatch('install');await (await app.caches.open('pantry-assets-test-build')).delete('/app.css');assert.equal((await app.message({type:'STATUS'})).ready,false);await app.message({type:'PREPARE'});assert.equal((await app.message({type:'STATUS'})).ready,true)});

test('private/no-store public-path responses and mismatched integrity never become a ready offline package',async()=>{
 const privateApp=harness({privatePath:'/recipes'});await assert.rejects(privateApp.dispatch('install'));assert.equal((await privateApp.message({type:'STATUS'})).ready,false);
 const altered=harness();altered.config.integrity={'/_next/static/app.js':'0'.repeat(64)};await assert.rejects(altered.dispatch('install'));assert.equal((await altered.message({type:'STATUS'})).ready,false);
});
test('authorization, RSC and private API traffic cannot enter a public cache',async()=>{
 const app=harness();await app.dispatch('install');
 for(const headers of [{Authorization:'Bearer private'},{RSC:'1'},{'Next-Router-State-Tree':'private'}])assert.equal(await app.dispatch('fetch',{request:new Request('https://pantry.test/_next/static/app.js',{headers})}),undefined);
 assert.equal(await app.dispatch('fetch',{request:new Request('https://pantry.test/?_rsc=private')}),undefined);
 const before=(await app.caches.keys()).length;await app.dispatch('fetch',{request:new Request('https://pantry.test/api/offline/workspace')});assert.equal((await app.caches.keys()).length,before);assert.equal(await app.caches.match('/api/offline/workspace'),undefined);
});

test('renamed static runtime copies retain strict integrity and hydrate original asset URLs offline',async()=>{
 const app=harness();const original='/_next/static/app.js',copy='/offline-assets/version/runtime-app.js';app.config.assetSources={[original]:copy};app.config.integrity={[original]:Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode('saved:'+copy))).toString('hex')};
 await app.dispatch('install');assert.equal((await app.message({type:'STATUS'})).ready,true);app.offline();const calls=app.networkCalls;const response=await app.dispatch('fetch',{request:new Request('https://pantry.test'+original)});assert.equal(response.url,'','copied assets must resolve relative URLs against their original request');assert.equal(await response.text(),'saved:'+copy);assert.equal(app.networkCalls,calls);
});
