import {AsyncLocalStorage} from "node:async_hooks";

export const modelSelectionContext=new AsyncLocalStorage();

export function withModelSelection(provider,fn){
  if(!provider) return fn();
  return modelSelectionContext.run(provider,fn);
}

function parseJsonText(raw) {
  const text=String(raw??"").trim();
  try { return JSON.parse(text); } catch {}
  const positions=[text.indexOf("{"),text.indexOf("[")].filter(x=>x>=0);
  const start=positions.length?Math.min(...positions):-1;
  if(start<0) throw new Error("Model returned non-JSON response");
  const stack=[];
  let quote=false,escaped=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(quote){
      if(escaped) escaped=false;
      else if(ch==="\\") escaped=true;
      else if(ch==='"') quote=false;
      continue;
    }
    if(ch==='"'){quote=true;continue;}
    if(ch==="{"||ch==="[") stack.push(ch);
    else if(ch==="}"||ch==="]"){
      const expected=ch==="}"?"{":"[";
      if(stack.pop()!==expected) break;
      if(!stack.length) return JSON.parse(text.slice(start,i+1));
    }
  }
  throw new Error("Model returned invalid JSON: "+text.slice(0,300));
}

export class AnthropicProvider {
  constructor({apiKey=process.env.ANTHROPIC_API_KEY,baseUrl=process.env.JORA_ANTHROPIC_BASE_URL||"https://api.anthropic.com/v1",model=process.env.JORA_ANTHROPIC_MODEL||"claude-sonnet-4-5"}={}) {
    if(!apiKey) throw new Error("Anthropic API key is required");
    this.apiKey=apiKey; this.baseUrl=baseUrl.replace(/\/$/,""); this.model=model;
  }
  async complete({messages=[],model=this.model,temperature=0}={}) {
    const system=messages.filter(x=>x.role==="system").map(x=>x.content).join("\n");
    const userMessages=messages.filter(x=>x.role!=="system").map(x=>({role:x.role==="assistant"?"assistant":"user",content:String(x.content??"")}));
    const response=await fetch(this.baseUrl+"/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":this.apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model,messages:userMessages,max_tokens:8192,temperature,...(system?{system}:{})})});
    const raw=await response.text();
    let data;
    try { data=parseJsonText(raw); }
    catch(error) {
      throw new Error("Anthropic response parsing failed: "+error.message);
    }
    if(!response.ok) throw new Error("Anthropic request failed: "+response.status+" "+JSON.stringify(data));
    return {text:data.content?.filter(x=>x.type==="text").map(x=>x.text).join("")??"",raw:data,usage:data.usage};
  }
}

export class MultiModelGateway {
  constructor({providers=new Map(),defaultModel="default",fallbackModels=[]}={}){this.providers=providers;this.defaultModel=defaultModel;this.fallbackModels=fallbackModels;}
  register(name,provider){if(!name||!provider?.complete)throw new Error("Valid provider is required");this.providers.set(name,provider);}
  providerFor(model){
    if(this.providers.has(model))return this.providers.get(model);
    if(model?.startsWith("claude"))return this.providers.get("claude");
    if(model?.startsWith("codex")||model?.startsWith("gpt"))return this.providers.get("openai");
    return this.providers.get("default");
  }
  async complete(request={}) {
    const selected=modelSelectionContext.getStore();
    const requested=selected??request.model??this.defaultModel;
    const candidates=[requested,...(selected?[]:this.fallbackModels)].filter((x,i,a)=>x&&a.indexOf(x)===i);
    const errors=[];
    for(const model of candidates){
      const provider=this.providerFor(model);
      if(!provider) {errors.push(model+": provider unavailable");continue;}
      const started=Date.now();
      try {
        const result=await provider.complete({...request,model});
        return {...result,model,latencyMs:Date.now()-started,attemptedModels:candidates.slice(0,candidates.indexOf(model)+1)};
      } catch(error){errors.push(model+": "+error.message);}
    }
    throw new Error("All model providers failed: "+errors.join(" | "));
  }
  status(){return {models:[...this.providers.keys()],defaultModel:this.defaultModel,fallbackModels:this.fallbackModels};}
}