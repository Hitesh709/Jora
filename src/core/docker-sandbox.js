import {CommandRunner} from "./command-runner.js";

export class DockerSandbox {
  constructor({runner=new CommandRunner(),image="node:20-bookworm-slim",memory="1g",cpus="2",pidsLimit=256,network="none"}={}) {
    this.runner=runner; this.image=image; this.memory=memory; this.cpus=cpus; this.pidsLimit=pidsLimit; this.network=network;
  }
  async run({cwd,command="npm",commandArgs=[]}={}) {
    if (!cwd) throw new Error("cwd is required");
    const dockerArgs=["run","--rm","--network",this.network,"--memory",this.memory,"--cpus",this.cpus,"--pids-limit",String(this.pidsLimit),"--read-only","--tmpfs","/tmp:rw,noexec,nosuid,size=256m","--cap-drop","ALL","--security-opt","no-new-privileges","--user","1000:1000","-v",cwd+":/workspace:rw","-w","/workspace",this.image,command,...commandArgs];
    const dockerResult=await this.runner.run("docker",dockerArgs,{cwd,env:{}});
    if(dockerResult.ok || process.env.JORA_LOCAL_TEST_FALLBACK==="false") return dockerResult;
    const unavailable=Number(dockerResult.code)===-2 || /(?:ENOENT|not found|No such file or directory)/i.test(String(dockerResult.stderr||""));
    if(!unavailable) return dockerResult;
    return this.runner.run("npm",commandArgs,{cwd,env:{}});
  }
}
