import {CommandRunner} from "./command-runner.js";

export class LocalGitRepository {
  constructor({root,runner=new CommandRunner({timeoutMs:120000})}={}) {
    if (!root) throw new Error("root is required");
    this.root=root; this.runner=runner;
  }
  async git(args) {
    const r=await this.runner.run("git",args,{cwd:this.root});
    if (!r.ok) throw new Error(r.stderr||"git command failed");
    return r.stdout.trim();
  }
  async status(){return this.git(["status","--short"]);}
  async diff(){return this.git(["diff","--no-ext-diff"]);}
  async branch(){return this.git(["rev-parse","--abbrev-ref","HEAD"]);}
  async commit(message){
    await this.git(["add","-A"]);
    const status=await this.status();
    if (!status) return {committed:false,reason:"clean",commit:await this.git(["rev-parse","HEAD"])};
    await this.git(["commit","-m",message]);
    return {committed:true,commit:await this.git(["rev-parse","HEAD"])};
  }
  async currentCommit(){return this.git(["rev-parse","HEAD"]);}
  async checkout(branch){await this.git(["checkout",branch]); return {branch};}
  async createBranch(branch,base="HEAD"){
    await this.git(["checkout","-b",branch,base]);
    return {branch,base};
  }
  async mergeFastForward(branch){
    const before=await this.currentCommit();
    await this.git(["merge","--ff-only",branch]);
    return {branch,previous:before,commit:await this.currentCommit()};
  }
  async deleteBranch(branch,force=false){
    await this.git(["branch",force?"-D":"-d",branch]);
    return {deleted:true,branch};
  }
  async rollback(ref){await this.git(["reset","--hard",ref]); return {rolledBack:true,ref};}
  async rollbackBranch(branch,ref){
    const current=await this.branch();
    await this.checkout(branch);
    const result=await this.rollback(ref);
    if(current!==branch) await this.checkout(current);
    return {...result,branch};
  }
}
