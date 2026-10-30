"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
type OfflineState={online:boolean;ready:boolean;pages:number;total:number;cacheError:string;testing:boolean;persistent:boolean;saveState:string;testOffline:(value:boolean)=>Promise<void>;retry:()=>void};
const Context=createContext<OfflineState>({online:true,ready:false,pages:0,total:16,cacheError:"",testing:false,persistent:false,saveState:"saved",testOffline:async()=>{},retry:()=>{}});
export const useOffline=()=>useContext(Context);
async function messageWorker(message:Record<string,unknown>){
  const registration=await navigator.serviceWorker.ready;
  const worker=registration.active;
  if(!worker)throw new Error("Offline download is still getting ready");
  return new Promise<Record<string,unknown>>((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error("Offline setup timed out. Retry while connected.")),20000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data.error?reject(new Error(event.data.error)):resolve(event.data)};worker.postMessage(message,[channel.port2])});
}
export function OfflineProvider({children}:{children:ReactNode}){
  const [online,setOnline]=useState(true),[ready,setReady]=useState(false),[pages,setPages]=useState(0),[total,setTotal]=useState(16),[cacheError,setCacheError]=useState("");
  const [testing,setTesting]=useState(false),[persistent,setPersistent]=useState(false),[saveState,setSaveState]=useState("saved");
  useEffect(()=>{
    let stopped=false;
    const network=()=>setOnline(navigator.onLine);
    const saved=(event:Event)=>setSaveState((event as CustomEvent).detail.state);
    const accept=(data:Record<string,unknown>)=>{if(stopped)return;if(typeof data.ready==="boolean")setReady(data.ready);if(typeof data.pages==="number")setPages(data.pages);if(typeof data.total==="number")setTotal(data.total);if(typeof data.testing==="boolean")setTesting(data.testing);if(typeof data.error==="string")setCacheError(data.error)};
    const incoming=(event:MessageEvent)=>{if(event.data?.type==="OFFLINE_STATUS")accept(event.data)};
    network();window.addEventListener("online",network);window.addEventListener("offline",network);window.addEventListener("pantry-save",saved);
    if("serviceWorker" in navigator){
      navigator.serviceWorker.addEventListener("message",incoming);
      void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).then(async registration=>{
        const installing=registration.installing;if(installing)installing.addEventListener("statechange",()=>{if(installing.state==="redundant")setCacheError("Offline download was interrupted. Reconnect and retry.")});
        await navigator.serviceWorker.ready;
        accept(await messageWorker({type:"STATUS"}));
        if(navigator.onLine){void registration.update().catch(()=>{});void messageWorker({type:"PREPARE"}).then(accept).catch(error=>setCacheError(error.message))}
      }).catch(()=>setCacheError("Offline setup needs one complete online visit. Retry when connected."));
    }else setCacheError("This browser cannot save app pages offline. Use a current browser in normal browsing mode.");
    void navigator.storage?.persist?.().then(value=>{if(!stopped)setPersistent(value)}).catch(()=>{});
    return()=>{stopped=true;window.removeEventListener("online",network);window.removeEventListener("offline",network);window.removeEventListener("pantry-save",saved);navigator.serviceWorker?.removeEventListener("message",incoming)};
  },[]);
  const retry=()=>{setCacheError("");void messageWorker({type:"PREPARE"}).then(data=>{setReady(Boolean(data.ready));setPages(Number(data.pages));setTotal(Number(data.total))}).catch(error=>setCacheError(error.message))};
  const testOffline=async(value:boolean)=>{await messageWorker({type:"TEST_OFFLINE",value});setTesting(value);window.location.reload()};
  return <Context.Provider value={{online:online&&!testing,ready,pages,total,cacheError,testing,persistent,saveState,testOffline,retry}}>{children}</Context.Provider>;
}
