export class GitHubRestRepository {
  constructor({token=process.env.GITHUB_TOKEN,owner,repo,branch="main",apiBase="https://api.github.com"}={}) {
    if(!token) throw new Error("GitHub token is required");
    if(!owner||!repo) throw new Error("owner and repo are required");
    this.token=token; this.owner=owner; this.repo=repo; this.branch=branch; this.apiBase=apiBase.replace(/\/$/,"");
  }

  async request(path,options={}) {
    const response=await fetch(this.apiBase+path,{...options,headers:{
      "accept":"application/vnd.github+json",
      "content-type":"application/json",
      "authorization":"Bearer "+this.token,
      "X-GitHub-Api-Version":"2026-03-10",
      ...options.headers
    }});
    const data=await response.json();
    if(!response.ok) throw new Error("GitHub request failed: "+response.status+" "+JSON.stringify(data));
    return data;
  }

  pathFor(path){return encodeURIComponent(path).replace(/%2F/g,"/");}

  async read(path){
    const d=await this.request("/repos/"+this.owner+"/"+this.repo+"/contents/"+this.pathFor(path)+"?ref="+encodeURIComponent(this.branch));
    return {path,sha:d.sha,content:Buffer.from(d.content.replace(/\n/g,""),"base64").toString("utf8")};
  }

  async write(path,content,expectedSha=null,message="Jora update",branch=this.branch){
    const body={message,content:Buffer.from(content).toString("base64"),branch};
    if(expectedSha) body.sha=expectedSha;
    return this.request("/repos/"+this.owner+"/"+this.repo+"/contents/"+this.pathFor(path),{method:"PUT",body:JSON.stringify(body)});
  }

  async ref(branch=this.branch){
    return this.request("/repos/"+this.owner+"/"+this.repo+"/git/ref/heads/"+encodeURIComponent(branch));
  }

  async createBranch(branch,base=this.branch){
    const baseRef=await this.ref(base);
    return this.request("/repos/"+this.owner+"/"+this.repo+"/git/refs",{
      method:"POST",
      body:JSON.stringify({ref:"refs/heads/"+branch,sha:baseRef.object.sha})
    });
  }

  async createBlob(content){
    return this.request("/repos/"+this.owner+"/"+this.repo+"/git/blobs",{
      method:"POST",
      body:JSON.stringify({content,encoding:"utf-8"})
    });
  }

  async createTree(entries,baseTree){
    return this.request("/repos/"+this.owner+"/"+this.repo+"/git/trees",{
      method:"POST",
      body:JSON.stringify({base_tree:baseTree,tree:entries})
    });
  }

  async createCommit(message,treeSha,parentSha){
    return this.request("/repos/"+this.owner+"/"+this.repo+"/git/commits",{
      method:"POST",
      body:JSON.stringify({message,tree:treeSha,parents:[parentSha]})
    });
  }

  async updateRef(branch,sha,force=false){
    return this.request("/repos/"+this.owner+"/"+this.repo+"/git/refs/heads/"+encodeURIComponent(branch),{
      method:"PATCH",
      body:JSON.stringify({sha,force})
    });
  }

  async promoteBranch(candidateBranch,targetBranch=this.branch){
    const candidate=await this.ref(candidateBranch);
    const target=await this.ref(targetBranch);
    const updated=await this.updateRef(targetBranch,candidate.object.sha,false);
    return {
      promoted:true,
      candidateBranch,
      targetBranch,
      previous:target.object.sha,
      commit:candidate.object.sha,
      ref:updated.ref
    };
  }

  async rollback(ref,targetBranch=this.branch){
    const target=await this.ref(targetBranch);
    const updated=await this.updateRef(targetBranch,ref,true);
    return {
      rolledBack:true,
      targetBranch,
      previous:target.object.sha,
      ref,
      updated:updated.object?.sha??ref
    };
  }

  async commit(message){
    return {
      committed:false,
      reason:"GitHub Contents API creates commits per file; use createBlob/createTree/createCommit for atomic multi-file commits.",
      message
    };
  }
}
