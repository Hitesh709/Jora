import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {WebSearchProvider} from "../src/core/web-search-provider.js";
import {OperatorApi} from "../src/core/operator-api.js";

test("WebSearchProvider normalizes a configurable provider response",async()=>{
  const server=http.createServer(async(req,res)=>{
    let body="";
    for await(const chunk of req) body+=chunk;
    const payload=JSON.parse(body);
    assert.equal(payload.query,"jora search");
    res.writeHead(200,{"content-type":"application/json"});
    res.end(JSON.stringify({answer:"test answer",results:[{title:"Jora",url:"https://example.com",content:"result"}]}));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const port=server.address().port;
    const provider=new WebSearchProvider({provider:"tavily",apiKey:"test",endpoint:"http://127.0.0.1:"+port+"/search"});
    const result=await provider.search({query:"jora search",maxResults:3});
    assert.equal(result.provider,"tavily");
    assert.equal(result.answer,"test answer");
    assert.equal(result.results[0].title,"Jora");
    assert.equal(result.results[0].url,"https://example.com");
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test("operator api exposes authenticated search endpoint",async()=>{
  const api=new OperatorApi({
    runtime:{execute:async()=>({status:"PROMOTED"})},
    executionStore:{list:async()=>[]},
    authToken:"secret",
    searchProvider:{search:async({query})=>({provider:"fake",query,answer:"answer",results:[]})}
  });
  const address=await api.start();
  try{
    const response=await fetch("http://"+address.host+":"+address.port+"/v1/search?q=hello",{
      headers:{Authorization:"Bearer secret"}
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.status,"SEARCH_COMPLETED");
    assert.equal(body.query,"hello");
  } finally { await api.stop(); }
});

test("unconfigured search returns an explicit 503",async()=>{
  const provider=new WebSearchProvider({provider:"tavily",apiKey:null});
  await assert.rejects(()=>provider.search({query:"hello"}),error=>error.code==="SEARCH_NOT_CONFIGURED");
});
