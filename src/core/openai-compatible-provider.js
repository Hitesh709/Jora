export class OpenAICompatibleProvider {
  constructor({apiKey=process.env.OPENAI_API_KEY,baseUrl=process.env.JORA_MODEL_BASE_URL||"https://api.openai.com/v1",model=process.env.JORA_MODEL||"gpt-5.6",allowAnonymous=false,headers={}}={}) {
    if(!apiKey && !allowAnonymous) throw new Error("API key is required");
    this.apiKey=apiKey||null; this.baseUrl=baseUrl.replace(/\/$/,""); this.model=model; this.allowAnonymous=allowAnonymous; this.headers=headers;
  }
  async complete({messages=[],model=this.model,temperature=0}={}) {
    const headers={"content-type":"application/json",...this.headers};
    if(this.apiKey) headers.authorization="Bearer "+this.apiKey;
    const response=await fetch(this.baseUrl+"/chat/completions",{method:"POST",headers,body:JSON.stringify({model,messages,temperature})});
    const data=await response.json();
    if(!response.ok) throw new Error("Model request failed: "+response.status+" "+JSON.stringify(data));
    return {text:data.choices?.[0]?.message?.content??"",raw:data,usage:data.usage};
  }
}