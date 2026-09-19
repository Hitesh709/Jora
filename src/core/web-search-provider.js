import {URL} from "node:url";

export class WebSearchProvider {
  constructor({
    provider=process.env.JORA_SEARCH_PROVIDER||"auto",
    apiKey=process.env.JORA_SEARCH_API_KEY||process.env.TAVILY_API_KEY||process.env.BRAVE_SEARCH_API_KEY||null,
    endpoint=process.env.JORA_SEARCH_ENDPOINT||null,
    timeoutMs=Number(process.env.JORA_SEARCH_TIMEOUT_MS||15000),
    maxResults=Number(process.env.JORA_SEARCH_MAX_RESULTS||8)
  }={}) {
    this.provider=String(provider||"auto").toLowerCase();
    this.apiKey=apiKey;
    this.endpoint=endpoint;
    this.timeoutMs=Math.max(1000,timeoutMs);
    this.maxResults=Math.min(20,Math.max(1,maxResults));
  }

  available() {
    if(this.provider==="disabled"||this.provider==="none") return false;
    if(this.endpoint && this.apiKey) return true;
    if(this.provider==="tavily") return Boolean(this.apiKey);
    if(this.provider==="brave") return Boolean(this.apiKey);
    return Boolean(process.env.TAVILY_API_KEY||process.env.BRAVE_SEARCH_API_KEY||this.apiKey);
  }

  resolvedProvider() {
    if(this.provider!=="auto") return this.provider;
    if(process.env.TAVILY_API_KEY||this.apiKey && this.endpoint?.includes("tavily")) return "tavily";
    if(process.env.BRAVE_SEARCH_API_KEY||this.apiKey && this.endpoint?.includes("brave")) return "brave";
    return process.env.BRAVE_SEARCH_API_KEY ? "brave" : "tavily";
  }

  async search({query,maxResults=this.maxResults,topic="general"}={}) {
    const q=String(query||"").trim();
    if(!q) throw new Error("query is required");
    if(q.length>1000) throw new Error("query is too long");
    if(!this.available()) {
      const error=new Error("web search is not configured; set JORA_SEARCH_PROVIDER and a supported search API key");
      error.code="SEARCH_NOT_CONFIGURED";
      throw error;
    }
    const limit=Math.min(20,Math.max(1,Number(maxResults)||this.maxResults));
    const provider=this.resolvedProvider();
    if(provider==="tavily") return this._tavily(q,limit,topic);
    if(provider==="brave") return this._brave(q,limit);
    throw new Error("unsupported search provider: "+provider);
  }

  async _fetch(url,options={}) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await fetch(url,{...options,signal:controller.signal});
      const text=await response.text();
      let data=null;
      try { data=JSON.parse(text); } catch {}
      if(!response.ok) {
        const message=data?.detail||data?.message||data?.error||text||response.statusText;
        const error=new Error("search provider error: "+message);
        error.status=response.status;
        throw error;
      }
      return data;
    } finally { clearTimeout(timer); }
  }

  async _tavily(query,maxResults,topic) {
    const endpoint=this.endpoint||"https://api.tavily.com/search";
    const data=await this._fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        api_key:this.apiKey,
        query,
        topic,
        search_depth:"advanced",
        max_results:maxResults,
        include_answer:true,
        include_raw_content:false
      })
    });
    return {
      provider:"tavily",
      query,
      answer:data?.answer||null,
      results:(data?.results||[]).map((item,index)=>({
        rank:index+1,
        title:item.title||"",
        url:item.url||"",
        snippet:item.content||"",
        publishedAt:item.published_date||null
      }))
    };
  }

  async _brave(query,maxResults) {
    const url=new URL(this.endpoint||"https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q",query);
    url.searchParams.set("count",String(maxResults));
    const data=await this._fetch(url.toString(),{
      headers:{"Accept":"application/json","X-Subscription-Token":this.apiKey}
    });
    return {
      provider:"brave",
      query,
      answer:null,
      results:(data?.web?.results||[]).map((item,index)=>({
        rank:index+1,
        title:item.title||"",
        url:item.url||"",
        snippet:item.description||"",
        publishedAt:item.age||null
      }))
    };
  }
}
