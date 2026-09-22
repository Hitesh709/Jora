import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {LocalGitRepository} from "./local-git.js";

export class WorkspaceRepository {
  constructor({root,git=null,remoteRepository=null}={}) {
    if (!root) throw new Error("workspace root is required");
    this.root=path.resolve(root);
    this.git=git ?? new LocalGitRepository({root:this.root});
    this.remoteRepository=remoteRepository;
    this.ready=false;
    this.candidateBranch=null;
    this.candidateBase=null;
    this.baseBranch=null;
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
      const status=await this.git.status();
      if(!status) {
        await this.git.runner.run("git",["commit","--allow-empty","-m","Initialize Jora workspace"],{cwd:this.root});
      }
    }
    this.baseBranch=await this.git.branch();
    this.ready=true;
  }
  async prepareCandidate(id=Date.now(),base=this.baseBranch||"HEAD") {
    await this.ensureReady();
    const status=await this.git.status().catch(()=> "");
    if(status) await this.git.runner.run("git",["reset","--hard","HEAD"],{cwd:this.root});
    // Candidate workspaces must be isolated between runs. Remove untracked files from
    // a rejected/previous candidate so stale artifacts cannot affect tests or security gates.
    await this.git.runner.run("git",["clean","-fd"],{cwd:this.root});
    const branch=`jora/candidate-${String(id).replace(/[^a-zA-Z0-9._-]/g,"-")}`;
    const existing=await this.git.runner.run("git",["rev-parse","--verify",branch],{cwd:this.root});
    if(existing.ok) {
      await this.git.checkout(base);
      await this.git.deleteBranch(branch,true);
    }
    await this.git.createBranch(branch,base);
    this.candidateBranch=branch;
    this.candidateBase=await this.git.currentCommit();
    return {branch,base:this.candidateBase};
  }
  async prepareFreshCandidate(id=Date.now(),base=this.baseBranch||"HEAD") {
    const candidate=await this.prepareCandidate(id,base);
    // A new product must not inherit the previous promoted application's files.
    // Keep Git history/branch isolation, but start the candidate filesystem empty.
    const tracked=await this.git.runner.run("git",["ls-files"],{cwd:this.root});
    if(tracked.ok) {
      const files=String(tracked.stdout||"").split("\n").map(x=>x.trim()).filter(Boolean);
      if(files.length) await this.git.runner.run("git",["rm","-r","--ignore-unmatch","--",...files],{cwd:this.root});
    }
    await this.git.runner.run("git",["clean","-fd"],{cwd:this.root});
    return {...candidate,fresh:true};
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
  async snapshot() {
    const files=[];
    for(const filePath of await this.list(".")) {
      files.push({path:filePath,content:await this.read(filePath)});
    }
    return files;
  }
  async commit(message="Jora candidate promotion") {
    await this.ensureReady();
    const result=await this.git.commit(message);
    const local={...result,branch:this.candidateBranch??await this.git.branch(),base:this.candidateBase};
    if(!this.remoteRepository) return local;
    const remote=await this.remoteRepository.publishCandidate({
      branch:local.branch,
      targetBranch:this.remoteRepository.branch,
      files:await this.snapshot(),
      message
    });
    return {...local,remote};
  }
  async promoteCandidate({branch=this.candidateBranch,targetBranch=this.baseBranch??"main",deleteCandidate=false}={}) {
    await this.ensureReady();
    if(!branch) throw new Error("candidate branch is required");
    let remote=null;
    if(this.remoteRepository) {
      remote=await this.remoteRepository.promoteBranch(
        branch,
        targetBranch
      );
    }
    const current=await this.git.branch();
    const candidateCommit=await this.git.currentCommit();
    if(current!==targetBranch) await this.git.checkout(targetBranch);
    const previous=await this.git.currentCommit();
    const merge=await this.git.mergeFastForward(branch);
    if(deleteCandidate) await this.git.deleteBranch(branch);
    if(current!==targetBranch) await this.git.checkout(current);
    return {
      promoted:true,
      branch,
      targetBranch,
      previous,
      candidateCommit,
      commit:merge.commit,
      remote
    };
  }
  async rollbackTo(ref,{branch=this.baseBranch??"main"}={}) {
    await this.ensureReady();
    const local=await this.git.rollbackBranch(branch,ref);
    const remote=this.remoteRepository
      ? await this.remoteRepository.rollback(ref,branch)
      : null;
    return {...local,remote};
  }
  async rollback(ref) { return this.rollbackTo(ref,{branch:await this.git.branch()}); }
  async branch() { await this.ensureReady(); return this.git.branch(); }
}
