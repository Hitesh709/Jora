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
    const data=response.status===204?{}:await response.json();
    if(!response.ok) throw new Error("GitHub request failed: "+response.status+" "+JSON.stringify(data));
    return data;
  }

  pathFor(path){return encodeURIComponent(path).replace(/%2F/g,"/");}

  async provisionRepository({name,description="",private:true,organization=null,autoInit=true}={}) {
    if(!name||!String(name).trim()) throw new Error("repository name is required");
    const clean=String(name).trim().replace(/[^a-zA-Z0-9._-]/g,"-").replace(/^-+|-+$/g,"").slice(0,100);
    if(!clean) throw new Error("invalid repository name");
    const endpoint=organization
      ? "/orgs/"+encodeURIComponent(organization)+"/repos"
      : "/user/repos";
    return this.request(endpoint,{method:"POST",body:JSON.stringify({name:clean,description,private:Boolean(private),auto_init:Boolean(autoInit)})});
  }

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
    return this.createBranchAtSha(branch,baseRef.object.sha);
  }

  async createBranchAtSha(branch,sha){
    return this.request("/repos/"+this.owner+"/"+this.repo+"/git/refs",{
      method:"POST",
      body:JSON.stringify({ref:"refs/heads/"+branch,sha})
    });
  }

  async deleteBranch(branch){
    return this.request("/repos/"+this.owner+"/"+this.repo+"/git/refs/heads/"+encodeURIComponent(branch),{method:"DELETE"});
  }

  async getCommit(sha){
    return this.request("/repos/"+this.owner+"/"+this.repo+"/git/commits/"+encodeURIComponent(sha));
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

  async publishCandidate({branch,targetBranch=this.branch,files=[],message="Jora candidate"}={}){
    if(!branch) throw new Error("candidate branch is required");
    let parentSha;
    let branchExists=true;
    try {
      parentSha=(await this.ref(branch)).object.sha;
    } catch(error) {
      if(!/404/.test(error.message)) throw error;
      branchExists=false;
      parentSha=(await this.ref(targetBranch)).object.sha;
    }
    const parentCommit=await this.getCommit(parentSha);
    const tree=await this.createTree(
      files.map(file=>{
        if(!file?.path||file.path.startsWith("/")||file.path.split("/").includes("..")) {
          throw new Error("unsafe candidate file path");
        }
        return {path:file.path,mode:"100644",type:"blob",content:String(file.content??"")};
      }),
      parentCommit.tree.sha
    );
    const commit=await this.createCommit(message,tree.sha,parentSha);
    const refResult=branchExists
      ? await this.updateRef(branch,commit.sha,false)
      : await this.createBranchAtSha(branch,commit.sha);
    return {
      published:true,
      branch,
      targetBranch,
      parent:parentSha,
      tree:tree.sha,
      commit:commit.sha,
      ref:refResult.ref,
      updatedExisting:branchExists
    };
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

  async listWorkflowRuns({branch=null,headSha=null,perPage=50}={}){
    const params=new URLSearchParams({per_page:String(perPage)});
    if(branch) params.set("branch",branch);
    if(headSha) params.set("head_sha",headSha);
    const data=await this.request("/repos/"+this.owner+"/"+this.repo+"/actions/runs?"+params.toString());
    return data.workflow_runs??[];
  }

  async workflowFailureEvidence(run){
    const jobsData=await this.request("/repos/"+this.owner+"/"+this.repo+"/actions/runs/"+run.id+"/jobs?per_page=100");
    const jobs=jobsData.jobs??[];
    const failedJobs=[];
    for(const job of jobs.filter(item=>item.conclusion==="failure"||item.conclusion==="timed_out"||item.conclusion==="cancelled")) {
      const logsResponse=await fetch(this.apiBase+"/repos/"+this.owner+"/"+this.repo+"/actions/jobs/"+job.id+"/logs",{
        headers:{
          "accept":"application/vnd.github+json",
          "authorization":"Bearer "+this.token,
          "X-GitHub-Api-Version":"2026-03-10"
        }
      });
      const logs=logsResponse.ok?await logsResponse.text():"";
      failedJobs.push({
        id:job.id,
        name:job.name,
        conclusion:job.conclusion,
        steps:job.steps??[],
        logs:logs.slice(-12000)
      });
    }
    return {run,failedJobs};
  }

  async waitForWorkflow({branch=null,headSha,timeoutMs=600000,pollMs=5000}={}){
    if(!headSha) throw new Error("headSha is required");
    const deadline=Date.now()+timeoutMs;
    let seen=[];
    while(Date.now()<=deadline){
      seen=await this.listWorkflowRuns({branch,headSha});
      if(seen.length){
        const latestByWorkflow=new Map();
        for(const run of seen){
          const key=run.workflow_id??run.name??run.id;
          const previous=latestByWorkflow.get(key);
          if(!previous || new Date(run.created_at??0)>new Date(previous.created_at??0)) {
            latestByWorkflow.set(key,run);
          }
        }
        const runs=[...latestByWorkflow.values()];
        const failed=runs.find(run=>run.status==="completed" && run.conclusion!=="success");
        if(failed) {
          const evidence=await this.workflowFailureEvidence(failed);
          return {passed:false,status:"FAILED",headSha,branch,runs,evidence};
        }
        if(runs.length && runs.every(run=>run.status==="completed" && run.conclusion==="success")) {
          return {passed:true,status:"PASSED",headSha,branch,runs};
        }
      }
      await new Promise(resolve=>setTimeout(resolve,pollMs));
    }
    return {passed:false,status:"TIMEOUT",headSha,branch,runs:seen};
  }

  async createPullRequest({title,body="",head,base=this.branch,draft=false}={}) {
    if(!title||!head) throw new Error("title and head are required");
    return this.request("/repos/"+this.owner+"/"+this.repo+"/pulls",{
      method:"POST",
      body:JSON.stringify({title,body,head,base,draft})
    });
  }

  async getPullRequest(number) {
    if(!number) throw new Error("pull request number is required");
    return this.request("/repos/"+this.owner+"/"+this.repo+"/pulls/"+encodeURIComponent(number));
  }

  async listPullRequests({state="open",head=null,base=null,perPage=50}={}) {
    const params=new URLSearchParams({state,per_page:String(perPage)});
    if(head) params.set("head",head);
    if(base) params.set("base",base);
    return this.request("/repos/"+this.owner+"/"+this.repo+"/pulls?"+params.toString());
  }

  async commit(message){
    return {
      committed:false,
      reason:"GitHub Contents API creates commits per file; use publishCandidate or createBlob/createTree/createCommit for atomic multi-file commits.",
      message
    };
  }
}
