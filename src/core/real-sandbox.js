import {execFile} from "node:child_process";
import {promisify} from "node:util";
const execFileAsync = promisify(execFile);

export class ProcessSandbox {
  constructor({command="node", baseArgs=[], timeoutMs=30000, maxOutputBytes=1_000_000, envAllowlist=[]}={}) {
    this.command=command; this.baseArgs=baseArgs; this.timeoutMs=timeoutMs;
    this.maxOutputBytes=maxOutputBytes; this.envAllowlist=new Set(envAllowlist);
  }

  async run(args=[], {cwd, env={}}={}) {
    const safeEnv={};
    for (const key of this.envAllowlist) if (key in env) safeEnv[key]=env[key];
    const result=await execFileAsync(this.command,[...this.baseArgs,...args],{
      cwd, env:{PATH:process.env.PATH,NODE_ENV:"test",...safeEnv},
      timeout:this.timeoutMs,
      maxBuffer:this.maxOutputBytes
    });
    return {ok:true,stdout:result.stdout,stderr:result.stderr};
  }
}
