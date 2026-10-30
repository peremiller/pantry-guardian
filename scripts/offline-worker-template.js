/* Configuration is injected by build-offline.mjs for each production build. */
const SHELL=`pantry-shell-${CONFIG.version}`;
const ASSET_CACHE=`pantry-assets-${CONFIG.version}`;
const META="pantry-offline-meta";
const completeKey="/__pantry_complete__";
const testKey="/__pantry_test_offline__";
let preparing;
async function testing(){return Boolean(await (await caches.open(META)).match(testKey))}
async function status(){const cache=await caches.open(SHELL);let pages=0;for(const route of CONFIG.routes)if(await cache.match(route))pages++;return {type:"OFFLINE_STATUS",ready:Boolean(await cache.match(completeKey))&&pages===CONFIG.routes.length&&(await Promise.all(CONFIG.assets.map(async asset=>Boolean(await (await caches.open(ASSET_CACHE)).match(asset))))).every(Boolean),pages,total:CONFIG.routes.length,testing:await testing()}}
async function broadcast(){const data=await status();for(const client of await self.clients.matchAll({includeUncontrolled:true}))client.postMessage(data);return data}
async function saveAssets(urls){const cache=await caches.open(ASSET_CACHE);let cursor=0;const queue=[...new Set(urls)];await Promise.all(Array.from({length:4},async()=>{while(cursor<queue.length){const path=queue[cursor++];if(await cache.match(path))continue;const response=await fetch(new Request(path,{cache:"reload",credentials:"same-origin"}));if(!response.ok)throw new Error(`Could not save ${path}`);await cache.put(path,response)}}))}
async function prepare(){
  if(preparing)return preparing;
  preparing=(async()=>{
    const existing=await status();if(existing.ready)return existing;if(await testing())throw new Error("End the offline test before downloading an update");
    const cache=await caches.open(SHELL);
    await saveAssets(CONFIG.assets);
    for(const route of CONFIG.routes){const response=await fetch(new Request(route,{headers:{Accept:"text/html"},cache:"reload",credentials:"omit"}));if(!response.ok||!response.headers.get("content-type")?.includes("text/html"))throw new Error(`Could not save page ${route}`);await cache.put(route,response);await broadcast()}
    await cache.put(completeKey,new Response("ready"));
    return broadcast();
  })().finally(()=>{preparing=undefined});
  return preparing;
}
self.addEventListener("install",event=>event.waitUntil(prepare().then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil((async()=>{await self.clients.claim();await broadcast();/* Retain the previous release for tabs still running it. */const shells=(await caches.keys()).filter(key=>key.startsWith("pantry-shell-")&&key!==SHELL);for(const old of shells.slice(0,-1)){await caches.delete(old);await caches.delete(old.replace("pantry-shell-","pantry-assets-"))}})()));
self.addEventListener("message",event=>{
  const reply=data=>event.ports[0]?.postMessage(data);
  if(event.data?.type==="STATUS")event.waitUntil(status().then(reply));
  if(event.data?.type==="PREPARE")event.waitUntil(prepare().then(reply).catch(error=>reply({error:error.message})));
  if(event.data?.type==="TEST_OFFLINE")event.waitUntil((async()=>{const meta=await caches.open(META);if(event.data.value){if(!(await status()).ready)throw new Error("Wait for offline download to finish");await meta.put(testKey,new Response("1"))}else await meta.delete(testKey);reply(await broadcast())})().catch(error=>reply({error:error.message})));
});
async function cachedAsset(request){const current=await caches.open(ASSET_CACHE);const saved=await current.match(request,{ignoreSearch:true})||await caches.match(request,{ignoreSearch:true});if(saved)return saved;if(await testing())return Response.error();const response=await fetch(request);if(response.ok)await current.put(request,response.clone());return response}
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.method!=="GET"){event.respondWith((async()=>{if(await testing())return Response.json({error:"Offline test: connect to complete this action."},{status:503});return fetch(request)})());return}
  if(request.mode==="navigate"){
    const path=url.pathname.replace(/\/$/,"")||"/";
    if(!CONFIG.routes.includes(path))return;
    event.respondWith((async()=>{
      const cached=await (await caches.open(SHELL)).match(path);
      if(await testing()){return cached||new Response("This page is not saved yet. Reconnect and open Pantry Guardian.",{status:503,headers:{"Content-Type":"text/plain"}})}
      /* Saved pages launch immediately; online visits update through a new worker build. */
      if(cached)return cached;
      return fetch(request);
    })());return;
  }
  if(url.pathname.startsWith("/_next/static/")||CONFIG.assets.includes(url.pathname)){event.respondWith(cachedAsset(request));return}
  if(url.pathname.startsWith("/api/")&&url.pathname!=="/api/auth/session"){
    event.respondWith((async()=>{if(await testing())return Response.json({error:"Offline mode: this action needs a connection."},{status:503});return fetch(request)})());return;
  }
  if(url.pathname==="/api/auth/session"){event.respondWith((async()=>{if(await testing())return Response.json({});try{return await fetch(request)}catch{return Response.json({})}})())}
});
