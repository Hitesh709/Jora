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
    if (!status) return {committed:false,reason:"clean"};
    await this.git(["commit","-m",message]);
    return {committed:true,commit:await this.git(["rev-parse","HEAD"])};
  }
  async rollback(ref){await this.git(["reset","--hard",ref]); return {rolledBack:true,ref};}
}
