import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {execFile,spawn} from "node:child_process";
import {promisify} from "node:util";
import net from "node:net";

const execFileAsync=promisify(execFile);

export async function createWorkspace(prefix="jora-project"){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),prefix.replace(/[^a-z0-9-]/gi,"-")+"-"));
  return {root};
}

export async function writeWorkspaceFiles(root,files=[]){
  const written=[];
  for(const file of files){
    const relative=String(file.path||"").replace(/^[/\\]+/,"");
    if(!relative||relative.split(/[\\/]/).includes("..")) throw new Error("unsafe workspace path");
    const target=path.join(root,relative);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,String(file.content??""),"utf8");
    written.push({path:relative,bytes:Buffer.byteLength(String(file.content??""))});
  }
  return written;
}

export async function readWorkspaceFile(root,relativePath){
  const safe=String(relativePath).replace(/^[/\\]+/,"");
  if(!safe||safe.split(/[\\/]/).includes("..")) throw new Error("unsafe workspace path");
  return fs.readFile(path.join(root,safe),"utf8");
}

export async function runWorkspaceCommand(root,command,args=[],{timeout=120000}={}){
  const result=await execFileAsync(command,args,{cwd:root,timeout,maxBuffer:4*1024*1024});
  return {command,args,stdout:result.stdout,stderr:result.stderr,code:0};
}

export async function runWorkspaceTests(root,{command="npm",args=["test"],timeout=120000}={}){
  try{return {passed:true,...await runWorkspaceCommand(root,command,args,{timeout})};}
  catch(error){return {passed:false,command,args,stdout:error.stdout||"",stderr:error.stderr||error.message,code:typeof error.code==="number"?error.code:null};}
}

export async function findFreePort({host="127.0.0.1"}={}){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once("error",reject);
    server.listen(0,host,()=>{
      const port=server.address().port;
      server.close(()=>resolve(port));
    });
  });
}

function collectProcessOutput(child){
  let stdout="",stderr="";
  child.stdout?.on("data",chunk=>{stdout+=chunk.toString();});
  child.stderr?.on("data",chunk=>{stderr+=chunk.toString();});
  return {get stdout(){return stdout;},get stderr(){return stderr;}};
}

export async function waitForHttp(url,{timeout=15000,interval=100}={}){
  const started=Date.now();
  let lastError=null;
  while(Date.now()-started<timeout){
    try{
      const response=await fetch(url);
      const body=await response.text();
      return {passed:response.ok,status:response.status,body};
    }catch(error){lastError=error;await new Promise(resolve=>setTimeout(resolve,interval));}
  }
  return {passed:false,status:null,body:"",error:lastError?.message||"health check timed out"};
}

export async function startWorkspacePreview(root,{command="npm",args=["start"],port=null,host="127.0.0.1",timeout=15000,healthPath="/health"}={}){
  const selectedPort=port||await findFreePort({host});
  const child=spawn(command,args,{cwd:root,env:{...process.env,PORT:String(selectedPort),HOST:host},stdio:["ignore","pipe","pipe"]});
  const output=collectProcessOutput(child);
  let exited=null;
  child.once("exit",(code,signal)=>{exited={code,signal};});
  const url="http://"+host+":"+selectedPort;
  const health=await waitForHttp(url+healthPath,{timeout});
  if(!health.passed){
    await stopWorkspacePreview({process:child});
    return {status:"PREVIEW_FAILED",url,port:selectedPort,pid:child.pid,health,stdout:output.stdout,stderr:output.stderr,exited};
  }
  return {status:"PREVIEW_RUNNING",url,port:selectedPort,pid:child.pid,health,stdout:output,process:child,startedAt:new Date().toISOString()};
}

export async function stopWorkspacePreview(preview){
  const child=preview?.process;
  if(!child) return {stopped:false};
  if(child.exitCode!==null||child.signalCode) return {stopped:true};
  return new Promise(resolve=>{
    const timer=setTimeout(()=>{try{child.kill("SIGKILL");}catch{} resolve({stopped:true,forced:true});},3000);
    child.once("exit",()=>{clearTimeout(timer);resolve({stopped:true,forced:false});});
    try{child.kill("SIGTERM");}catch{clearTimeout(timer);resolve({stopped:true,forced:false});}
  });
}

export async function materializeGeneration(generation,{workspace=null}={}){
  const ws=workspace||await createWorkspace(generation?.strategy||"jora-project");
  const written=await writeWorkspaceFiles(ws.root,generation?.files||[]);
  return {...ws,written};
}

export async function inspectWorkspace(root){
  const entries=[];
  async function walk(dir){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name);
      const rel=path.relative(root,full);
      if(entry.isDirectory()) await walk(full);
      else entries.push(rel.replaceAll(path.sep,"/"));
    }
  }
  await walk(root);
  return entries.sort();
}
