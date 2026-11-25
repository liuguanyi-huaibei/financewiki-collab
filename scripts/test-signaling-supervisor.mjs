import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import assert from "node:assert/strict";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const root=mkdtempSync(join(process.argv[2]??process.cwd(),"signaling-test-"));
const getPort=()=>new Promise((resolve,reject)=>{
  const s=createServer();s.on("error",reject);
  s.listen({host:"::",port:0},()=>{const p=s.address().port;s.close(()=>resolve(p));});
});
const port=await getPort();
const state=join(root,"state");
const script=fileURLToPath(new URL("./signaling-supervisor.mjs",import.meta.url));
const launch=()=>spawn(process.execPath,[script,"--port",String(port),"--state",state,"--interval-ms","700"],{stdio:"ignore",windowsHide:true});
const exit=p=>new Promise(resolve=>{if(p.exitCode!==null||p.signalCode!==null)resolve(p.exitCode);else p.once("exit",resolve);});
const read=()=>{try{return JSON.parse(readFileSync(join(state,"status.json"),"utf8"));}catch{return {}; }};
async function waitFor(fn, label){
  const deadline=Date.now()+18000;
  while(Date.now()<deadline){const result=fn();if(result)return result;await sleep(150);}
  throw new Error("Timeout: "+label+" "+JSON.stringify(read()));
}
let sup=launch();
try{
  const first=await waitFor(()=>{const s=read();return s.phase==="healthy"&&s;},"initial health");
  console.log("PASS initial health",first.childPid);
  const dup=launch();assert.equal(await exit(dup),2);console.log("PASS duplicate rejected");
  process.kill(first.childPid);
  const second=await waitFor(()=>{const s=read();return s.phase==="healthy"&&s.childPid!==first.childPid&&s;},"child recovery");
  console.log("PASS child crash auto-restart",second.childPid);
  sup.kill();await exit(sup);
  await waitFor(()=>{try{process.kill(second.childPid,0);return false;}catch(e){return e.code==="ESRCH";}},"orphan cleanup");
  console.log("PASS parent exit reaps child");
  sup=launch();
  const third=await waitFor(()=>{const s=read();return s.phase==="healthy"&&s.supervisorPid===sup.pid&&s;},"stale lock recovery");
  console.log("PASS stale lock recovery",third.childPid);
  writeFileSync(join(state,"stop.request"),"");
  assert.equal(await exit(sup),0);assert.equal(read().phase,"stopped");
  console.log("PASS graceful stop");
  const occupied=createServer();await new Promise((resolve,reject)=>{occupied.on("error",reject);occupied.listen({port,host:"::"},resolve);});
  try{
    sup=launch();
    await waitFor(()=>read().phase==="port-conflict","port conflict");
    assert.equal(read().childPid,null);
    writeFileSync(join(state,"stop.request"),"");
    assert.equal(await exit(sup),0);
    assert.ok(occupied.listening);console.log("PASS occupied port not touched");
  }finally{occupied.close();}
}finally{
  if(sup.exitCode===null&&sup.signalCode===null){sup.kill();await exit(sup);}
  rmSync(root,{recursive:true,force:true});
}
