import test from "node:test";
import assert from "node:assert/strict";
import {OperatorApi} from "../src/core/operator-api.js";

function store(){
  return {async list(){return []},async get(){return null}};
}

test("chat exposes multilingual intent understanding for Roman Gujarati",async()=>{
  let received=null;
  const api=new OperatorApi({
    runtime:{execute:async()=>({status:"OK"})},
    executionStore:store(),
    modelGateway:{
      status:()=>({models:["jora"],defaultModel:"jora"}),
      complete:async(args)=>{received=args;return {text:"Samji gayo — hu tamari request samji rahyo chu.",model:"jora"}}
    },
    port:0
  });
  const address=await api.start();
  try{
    const response=await fetch("http://"+address.host+":"+address.port+"/v1/chat",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        message:"mare ek snake game banavvu che",
        messages:[{role:"user",content:"Jora, hu game banavva mango chu"}],
        context:{provider:"jora"}
      })
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.accepted,true);
    assert.equal(body.understanding.language.code,"gu-Latn");
    assert.equal(body.understanding.action,"build");
    assert.equal(body.understanding.domain,"game");
    assert.match(body.understanding.normalizedText,/snake game/i);
    assert.match(received.messages[0].content,/Roman Gujarati/i);
  } finally {
    await api.stop();
  }
});

test("understand endpoint returns intent plus legacy product specification when configured",async()=>{
  const api=new OperatorApi({
    runtime:{execute:async()=>({status:"OK"})},
    executionStore:store(),
    productUnderstanding:{understand:async({input})=>({input,kind:"web"})},
    port:0
  });
  const address=await api.start();
  try{
    const response=await fetch("http://"+address.host+":"+address.port+"/v1/understand",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({input:"mare ek website banavvi che"})
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.status,"UNDERSTOOD");
    assert.equal(body.understanding.action,"build");
    assert.equal(body.specification.kind,"web");
  } finally {
    await api.stop();
  }
});
