function parseJsonText(raw) {
  const text=String(raw??"").trim();
  try { return JSON.parse(text); } catch {}
  const start=Math.min(...[text.indexOf("{"),text.indexOf("[")].filter(x=>x>=0));
  if(!Number.isFinite(start)) throw new Error("Model returned non-JSON response");
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

export class OpenAICompatibleProvider {
  constructor({apiKey=process.env.OPENAI_API_KEY,baseUrl=process.env.JORA_MODEL_BASE_URL||"https://api.openai.com/v1",model=process.env.JORA_MODEL||"gpt-5.6",allowAnonymous=false,headers={}}={}) {
    if(!apiKey && !allowAnonymous) throw new Error("API key is required");
    this.apiKey=apiKey||null; this.baseUrl=baseUrl.replace(/\/$/,""); this.model=model; this.allowAnonymous=allowAnonymous; this.headers=headers;
  }
  async complete({messages=[],model=this.model,temperature=0}={}) {
    const headers={"content-type":"application/json",...this.headers};
    if(this.apiKey) headers.authorization="Bearer "+this.apiKey;
    const response=await fetch(this.baseUrl+"/chat/completions",{method:"POST",headers,body:JSON.stringify({model,messages,temperature})});
    const raw=await response.text();
    let data;
    try { data=parseJsonText(raw); }
    catch(error) {
      throw new Error("Model response parsing failed: "+error.message);
    }
    if(!response.ok) throw new Error("Model request failed: "+response.status+" "+JSON.stringify(data));
    return {text:data.choices?.[0]?.message?.content??"",raw:data,usage:data.usage};
  }
}