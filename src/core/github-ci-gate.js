export class GitHubCIGate {
  constructor({repository,timeoutMs=600000,pollMs=5000}={}) {
    if(!repository) throw new Error("repository is required");
    this.repository=repository;
    this.timeoutMs=timeoutMs;
    this.pollMs=pollMs;
  }

  async review({branch,commit}={}) {
    if(!commit) {
      return {passed:false,status:"NO_REMOTE_COMMIT",branch,reason:"candidate was not published to GitHub"};
    }
    return this.repository.waitForWorkflow({
      branch,
      headSha:commit,
      timeoutMs:this.timeoutMs,
      pollMs:this.pollMs
    });
  }
}
