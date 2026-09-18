export class HttpDeploymentAdapter {
  constructor({deployUrl,rollbackUrl=deployUrl,headers={},timeoutMs=60_000}={}) {
    if(!deployUrl) throw new Error("deployUrl is required");
    this.deployUrl=deployUrl;
    this.rollbackUrl=rollbackUrl;
    this.headers={"content-type":"application/json",...headers};
    this.timeoutMs=timeoutMs;
  }

  async _request(url,payload){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await fetch(url,{
        method:"POST",
       headers:this.headers,
       body:JSON.stringify(payload),
       signal:controller.signal
      });
      const text=await response.text();
      let body;
      try { body=JSON.parse(text); } catch { body={raw:text}; }
      if(!response.ok) throw new Error(`deployment endpoint returned ${response.status}`);
      return {status:response.status,...body};
    } finally {
      clearTimeout(timer);
    }
  }

  async deploy(candidate,context={}) {
    return this._request(this.deployUrl,{action:"deploy",candidate,context});
  }

  async rollback(ref,context={}) {
    return this._request(this.rollbackUrl,{action:"rollback",ref,context});
  }
}
