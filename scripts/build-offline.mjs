import {readFile,writeFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {pageTitles} from "../lib/navigation.ts";
async function walk(directory){const out=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=`${directory}/${entry.name}`;out.push(...entry.isDirectory()?await walk(path):[path])}return out}
const version=(await readFile(".next/BUILD_ID","utf8")).trim();
const assets=(await walk(".next/static")).filter(path=>/\.(js|css|woff2?|png|svg|ico)$/.test(path)).map(path=>path.replace(".next/","/_next/"));
assets.push("/favicon-v4.ico","/pantry-guardian-logo-v4.png","/pantry-guardian-logo-512.png","/manifest.webmanifest");
const routes=Object.keys(pageTitles),integrity={};
const prerender=JSON.parse(await readFile('.next/prerender-manifest.json','utf8'));
for(const route of routes){if(!prerender.routes[route])throw Error('Offline cache only accepts statically prerendered public pages: '+route);const file=route==='/'?'.next/server/app/index.html':'.next/server/app'+route+'.html';integrity[route]=createHash('sha256').update(await readFile(file)).digest('hex');}
for(const asset of assets){const file=asset.startsWith('/_next/static/')?'.next/'+asset.slice('/_next/'.length):'public'+asset;integrity[asset]=createHash('sha256').update(await readFile(file)).digest('hex');}
const config={version,routes,assets,integrity};
await writeFile("public/sw.js",`const CONFIG=${JSON.stringify(config)};\n${await readFile("scripts/offline-worker-template.js","utf8")}`);
await writeFile("public/offline-build.json",JSON.stringify({version,pages:config.routes.length,assets:assets.length}));
console.log(`Offline package: ${config.routes.length} pages, ${assets.length} assets, version ${version}`);
