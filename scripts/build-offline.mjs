import {readFile,writeFile,readdir} from "node:fs/promises";
import {pageTitles} from "../lib/navigation.ts";
async function walk(directory){const out=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=`${directory}/${entry.name}`;out.push(...entry.isDirectory()?await walk(path):[path])}return out}
const version=(await readFile(".next/BUILD_ID","utf8")).trim();
const assets=(await walk(".next/static")).filter(path=>/\.(js|css|woff2?|png|svg|ico)$/.test(path)).map(path=>path.replace(".next/","/_next/"));
assets.push("/favicon-v4.ico","/pantry-guardian-logo-v4.png","/pantry-guardian-logo-512.png","/manifest.webmanifest");
const config={version,routes:Object.keys(pageTitles),assets};
await writeFile("public/sw.js",`const CONFIG=${JSON.stringify(config)};\n${await readFile("scripts/offline-worker-template.js","utf8")}`);
await writeFile("public/offline-build.json",JSON.stringify({version,pages:config.routes.length,assets:assets.length}));
console.log(`Offline package: ${config.routes.length} pages, ${assets.length} assets, version ${version}`);
