export class HttpHealthCheck {
  constructor({url,timeoutMs=10_000,expectedStatus=200}={}) {
    if(!url) throw new Error("url is required");
    this.url=url; this.timeoutMs=timeoutMs; this.expectedStatus=expectedStatus;
  }

  async check(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await fetch(this.url,{method:"GET",signal:controller.signal});
      return {passed:response.status===this.expectedStatus,status:response.status,url:this.url};
    } catch(error) {
      return {passed:false,status:null,url:this.url,error:error.message};
    } finally {
      clearTimeout(timer);
    }
  }
}
