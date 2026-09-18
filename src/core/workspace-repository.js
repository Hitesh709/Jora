import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {LocalGitRepository} from "./local-git.js";

export class WorkspaceRepository {
  constructor({root,git=null}={}) {
    if (!root) throw new Error("workspace root is required");
    this.root=path.resolve(root);
    this.git=git ?? new LocalGitRepository({root:this.root});
    this.ready=false;
  }
  safePath(relativePath) {
    if (!relativePath || path.isAbsolute(relativePath)) throw new Error("relative file path is required");
    const target=path.resolve(this.root,relativePath);
    if (target!==this.root && !target.startsWith(this.root+path.sep)) throw new Error("path escapes workspace");
    return target;
  }
  async ensureReady() {
    if (this.ready) return;
    await fs.mkdir(this.root,{recursive:true});
    try { await this.git.branch(); }
    catch {
      const init=await this.git.runner.run("git",["init"],{cwd:this.root});
      if(!init.ok) throw new Error(init.stderr||"git init failed");
      await this.git.runner.run("git",["config","user.name","Jora"],{cwd:this.root});
      await this.git.runner.run("git",["config","user.email","jora@local.invalid"],{cwd:this.root});
    }
    this.ready=true;
  }
  async prepareCandidate(id=`${Date.now()}`) {
    await this.ensureReady();
    const status=await this.git.status().catch(()=>"");
    if(status) await this.git.runner.run("git",["reset","--hard","HEAD"],{cwd:this.root});
    const branch=`jora/candidate-${String(id).replace(/[^a-zA-Z0-9._-]/g,"-")}`;
    const result=await this.git.runner.run("git",["checkout","-b",branch],{cwd:this.root});
    if(!result.ok) throw new Error(result.stderr||"failed to create candidate branch");
    return {branch};
  }
  async write(relativePath,content) {
    await this.ensureReady();
    const target=this.safePath(relativePath);
    await fs.mkdir(path.dirname(target),{recursive:true});
    const temp=target+".jora-tmp";
    await fs.writeFile(temp,content,"utf8");
    await fs.rename(temp,target);
    return {path:relativePath,hash:crypto.createHash("sha256").update(content).digest("hex")};
  }
  async read(relativePath) {
    await this.ensureReady();
    return fs.readFile(this.safePath(relativePath),"utf8");
  }
  async list(relativeDir=".") {
    await this.ensureReady();
    const root=this.safePath(relativeDir);
    const result=[];
    const walk=async dir=>{
      for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
        if(entry.name===".git") continue;
        const target=path.join(dir,entry.name);
        if(entry.isDirectory()) await walk(target);
        else result.push(path.relative(this.root,target).split(path.sep).join("/"));
      }
    };
    await walk(root);
    return result;
  }
  async commit(message="Jora candidate promotion") { await this.ensureReady(); return this.git.commit(message); }
  async rollback(ref) { await this.ensureReady(); return this.git.rollback(ref); }
  async branch() { await this.ensureReady(); return this.git.branch(); }
}
