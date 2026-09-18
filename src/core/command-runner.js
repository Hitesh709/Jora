import {execFile} from "node:child_process";
import {promisify} from "node:util";
const execFileAsync=promisify(execFile);

export class CommandRunner {
  constructor({timeoutMs=120000,maxOutputBytes=2_000_000,envAllowlist=[]}={}) {
    this.timeoutMs=timeoutMs; this.maxOutputBytes=maxOutputBytes; this.envAllowlist=new Set(envAllowlist);
  }
  async run(command,args=[],{cwd,env={}}={}) {
    const safeEnv={};
    for (const key of this.envAllowlist) if (key in env) safeEnv[key]=env[key];
    try {
      const r=await execFileAsync(command,args,{cwd,env:{PATH:process.env.PATH,NODE_ENV:"test",...safeEnv},timeout:this.timeoutMs,maxBuffer:this.maxOutputBytes});
      return {ok:true,code:0,stdout:r.stdout,stderr:r.stderr};
    } catch (error) {
      return {ok:false,code:error.code??1,signal:error.signal??null,stdout:error.stdout??"",stderr:error.stderr??String(error.message??error)};
    }
  }
}
