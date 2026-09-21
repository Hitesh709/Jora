import {CommandRunner} from "./command-runner.js";

export class DockerSandbox {
  constructor({runner=new CommandRunner(),image="node:20-bookworm-slim",memory="1g",cpus="2",pidsLimit=256,network="none"}={}) {
    this.runner=runner; this.image=image; this.memory=memory; this.cpus=cpus; this.pidsLimit=pidsLimit; this.network=network;
  }
  buildArgs({cwd,command="npm",commandArgs=[],detach=false,ports=[]}={}) {
    return ["run","--rm",...(detach?["-d"]:[]),"--network",this.network,
      "--memory",this.memory,"--cpus",this.cpus,"--pids-limit",String(this.pidsLimit),
      "--read-only","--tmpfs","/tmp:rw,noexec,nosuid,size=256m",
      "--cap-drop","ALL","--security-opt","no-new-privileges","--user","1000:1000",
      ...ports.flatMap(port=>["-p",`${port}:${port}`]),
      "-v",cwd+":/workspace:rw","-w","/workspace",this.image,command,...commandArgs];
  }
  async run({cwd,command="npm",commandArgs=[]}={}) {
    if (!cwd) throw new Error("cwd is required");
    const dockerArgs=this.buildArgs({cwd,command,commandArgs});
    const dockerResult=await this.runner.run("docker",dockerArgs,{cwd,env:{}});
    if(dockerResult.ok || process.env.JORA_LOCAL_TEST_FALLBACK==="false") return dockerResult;
    const unavailable=Number(dockerResult.code)===-2 || /(?:ENOENT|not found|No such file or directory)/i.test(String(dockerResult.stderr||""));
    if(!unavailable) return dockerResult;
    return this.runner.run("npm",commandArgs,{cwd,env:{}});
  }
  async start({cwd,command="npm",commandArgs=[],ports=[],timeoutMs=15000,network="bridge"}={}) {
    if(!cwd) throw new Error("cwd is required");
    const args=this.buildArgs({cwd,command,commandArgs,detach:true,ports,network});
    const started=await this.runner.run("docker",args,{cwd,env:{}});
    if(!started.ok) return started;

    const containerId=String(started.stdout||"").trim().split(/\\s+/)[0];
    let stopped=false;
    const stop=async()=>{
      if(stopped||!containerId) return;
      stopped=true;
      await this.runner.run("docker",["stop","-t","2",containerId],{cwd,env:{}}).catch(()=>{});
    };
    const deadline=Date.now()+Math.min(timeoutMs,30000);
    while(Date.now()<deadline) {
      const probe=await this.runner.run("docker",["inspect","-f","{{.State.Running}}",containerId],{cwd,env:{}});
      if(probe.ok && String(probe.stdout).trim()==="true") return {ok:true,containerId,stop};
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    await stop();
    return {ok:false,code:124,stderr:"Generated application did not stay running",containerId};
  }
}
