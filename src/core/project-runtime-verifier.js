export function createProjectRuntimeVerifier({sandbox,port=4173,startArgs=["run","start","--","--host","0.0.0.0","--port",String(port)],timeoutMs=15000}={}) {
  if(!sandbox) throw new Error("sandbox is required");

  const configuredFetch=arguments[0]?.fetchImpl ?? null;

  return async ({cwd}={})=>{
    if(!cwd) return {ok:false,status:null,error:"Project workspace is required"};

    // Runtime verification is deliberately opt-in at the sandbox layer. The
    // verifier starts the generated app in the isolated sandbox, then probes
    // localhost from the verifier process when the sandbox exposes the port.
    const fetchImpl=typeof configuredFetch==="function" ? configuredFetch : globalThis.fetch;
    if(typeof fetchImpl!=="function") return {ok:false,status:null,error:"fetch is unavailable"};

    const started=await sandbox.start?.({
      cwd,
      command:"npm",
      commandArgs:startArgs,
      ports:[port],
      timeoutMs
    });

    if(!started?.ok) {
      return {
        ok:false,
        status:null,
        error:"Generated application failed to start",
        stdout:started?.stdout,
        stderr:started?.stderr,
        code:started?.code
      };
    }

    try {
      const response=await fetchImpl(`http://127.0.0.1:${port}/`,{
        signal:AbortSignal.timeout(Math.min(timeoutMs,5000))
      });
      const body=await response.text();
      return {
        ok:response.ok,
        status:response.status,
        contentType:response.headers.get("content-type"),
        bodyPreview:body.slice(0,1000)
      };
    } catch(error) {
      return {ok:false,status:null,error:error.message};
    } finally {
      await started.stop?.();
    }
  };
}
