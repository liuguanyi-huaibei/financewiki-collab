import { fork } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync, appendFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { WebSocket } from "ws";

const args = process.argv.slice(2);
const value = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i+1]; };
const port = Number(value("--port", "4444"));
const state = resolve(value("--state", fileURLToPath(new URL("../runtime", import.meta.url))));
const interval = Number(value("--interval-ms", "15000"));
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isFinite(interval) || interval < 500)
  throw new Error("Invalid port or health interval");
mkdirSync(state, {recursive:true});
const logs = join(state, "logs"); mkdirSync(logs, {recursive:true});
const lock = join(state, "supervisor.lock");
const stop = join(state, "stop.request");
const status = join(state, "status.json");
const runId = crypto.randomUUID();
let child = null, stopping = false, failures = 0, backoff = 1000, nextStart = 0;
let lastHealthy = null, started = null, healthInFlight = false, timer, nextProbe = 0;
function log(message) {
  const now = new Date().toISOString();
  appendFileSync(join(logs, now.slice(0,10)+".log"), now+" "+message+"\n");
  for (const f of readdirSync(logs)) {
    if (/^\d{4}-\d\d-\d\d\.log$/.test(f) && Date.now()-statSync(join(logs,f)).mtimeMs>14*86400000) unlinkSync(join(logs,f));
  }
}
function report(phase) {
  const data = {runId,supervisorPid:process.pid,childPid:child?.pid??null,port,phase,failures,lastHealthy,updated:new Date().toISOString()};
  const tmp = status+"."+runId+".tmp";
  writeFileSync(tmp, JSON.stringify(data,null,2)); renameSync(tmp,status);
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const portFree = () => new Promise(resolve => {
  const server = createServer();
  server.once("error",()=>resolve(false));
  server.listen({port,host:"::",exclusive:true},()=>server.close(()=>resolve(true)));
});
export function probe(port, timeout=3000) {
  return new Promise(resolve=>{
    const socket = new WebSocket("ws://127.0.0.1:"+port);
    let done=false;
    const finish = ok=>{if(done)return;done=true;clearTimeout(t);socket.terminate();resolve(ok);};
    const t=setTimeout(()=>finish(false),timeout);
    socket.on("error",()=>finish(false));
    socket.on("close",()=>finish(false));
    socket.on("open",()=>socket.send(JSON.stringify({type:"ping"})));
    socket.on("message",data=>{try{if(JSON.parse(data.toString()).type==="pong")finish(true);}catch{}});
  });
}
function finish() {
  clearInterval(timer);
  report("stopped"); log("supervisor stopped");
  if (existsSync(stop)) unlinkSync(stop);
  if (existsSync(lock) && JSON.parse(readFileSync(lock,"utf8")).runId===runId) unlinkSync(lock);
  process.exit(0);
}
function shutdown() {
  if(stopping)return;
  stopping=true; report("stopping");
  if(child) child.kill(); else finish();
}
async function start() {
  if(stopping||child)return;
  if(!(await portFree())) {
    log("port occupied; refusing to terminate or adopt unknown listener");
    report("port-conflict"); nextStart=Date.now()+60000; return;
  }
  if(stopping)return;
  started=Date.now(); failures=0; lastHealthy=null; nextProbe=Date.now()+500;
  const current = fork(fileURLToPath(new URL("./signaling-child.mjs",import.meta.url)),[],{
    env:{...process.env,PORT:String(port)}, stdio:["ignore","ignore","ignore","ipc"], windowsHide:true,
  });
  child=current; report("starting"); log("child started pid="+current.pid);
  current.on("error",()=>log("child process error"));
  current.once("exit",(code,signal)=>{
    if(child!==current)return;
    child=null; log("child exited code="+code+" signal="+signal);
    if(stopping){finish();return;}
    if(Date.now()-started>60000)backoff=1000;
    nextStart=Date.now()+backoff; backoff=Math.min(60000,backoff*2); report("backoff");
  });
}
async function tick() {
  if(stopping||healthInFlight)return;
  if(existsSync(stop)){shutdown();return;}
  healthInFlight=true;
  try{
    if(!child){if(Date.now()>=nextStart)await start();return;}
    if(Date.now()<nextProbe)return;
    nextProbe=Date.now()+interval;
    const current=child;
    const ok=await probe(port);
    if(child!==current||stopping)return;
    if(ok){failures=0;lastHealthy=new Date().toISOString();report("healthy");}
    else{
      failures++;report("unhealthy");log("health probe failure "+failures);
      if(failures>=3){log("restarting owned child");current.kill();}
    }
  }finally{healthInFlight=false;}
}
// The scheduled task is single-instance; a live PID is never terminated or adopted.
// Only a definitively dead PID can be reclaimed (PID reuse fails closed).
let fd;
try{fd=openSync(lock,"wx");}
catch(error){
  if(error.code!=="EEXIST")throw error;
  const old=JSON.parse(readFileSync(lock,"utf8"));
  if(!Number.isSafeInteger(old.pid)||old.pid<=0)throw new Error("Invalid lock; manual review required");
  let dead=false;
  try{process.kill(old.pid,0);}catch(e){dead=e.code==="ESRCH";}
  if(!dead){console.error("Supervisor lock is live or unverified");process.exit(2);}
  if(JSON.parse(readFileSync(lock,"utf8")).runId!==old.runId)process.exit(2);
  unlinkSync(lock);fd=openSync(lock,"wx");
}
writeFileSync(fd,JSON.stringify({runId,pid:process.pid,port}));closeSync(fd);
if(existsSync(stop))unlinkSync(stop);
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
log("supervisor started port="+port);
report("starting");
await start();
timer=setInterval(()=>void tick().catch(e=>{log("monitor error: "+e.name);}),Math.min(interval,1000));
// Tick once per second for stop/start, but health probes use the configured cadence.
