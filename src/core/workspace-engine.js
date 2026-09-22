import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

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
