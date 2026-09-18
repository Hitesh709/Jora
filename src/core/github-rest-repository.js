export class GitHubRestRepository {
  constructor({token=process.env.GITHUB_TOKEN,owner,repo,branch="main",apiBase="https://api.github.com"}={}) {
    if(!token) throw new Error("GitHub token is required");
    if(!owner||!repo) throw new Error("owner and repo are required");
    this.token=token; this.owner=owner; this.repo=repo; this.branch=branch; this.apiBase=apiBase.replace(/\\/$/,"");
  }
  async request(path,options={}) {
    const response=await fetch(this.apiBase+path,{...options,headers:{"accept":"application/vnd.github+json","content-type":"application/json","authorization:"+"Bearer "+this.token,...options.headers}});
    const data=await response.json();
    if(!response.ok) throw new Error("GitHub request failed: "+response.status+" "+JSON.stringify(data));
    return data;
  }
  async read(path){const d=await this.request("/repos/"+this.owner+"/"+this.repo+"/contents/"+encodeURIComponent(path).replace(/%2F/g,"/")+"?ref="+encodeURIComponent(this.branch)); return {path,sha:d.sha,content:Buffer.from(d.content.replace(/\\n/g,""),"base64").toString("utf8")};}
  async write(path,content,expectedSha=null,message="Jora update"){const body={message,content:Buffer.from(content).toString("base64"),branch:this.branch}; if(expectedSha) body.sha=expectedSha; return this.request("/repos/"+this.owner+"/"+this.repo+"/contents/"+encodeURIComponent(path).replace(/%2F/g,"/"),{method:"PUT",body:JSON.stringify(body)});}
  async commit(message){return {committed:false,reason:"GitHub Contents API creates commits per file; use write() for atomic file updates or a Git data client for multi-file commits.",message};}
  async rollback(ref){return {rolledBack:false,reason:"Rollback requires an explicit Git ref update policy.",ref};}
}
