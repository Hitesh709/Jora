export class RollbackManager {
  constructor({repository} = {}) {
    if (!repository || typeof repository.rollback !== "function") throw new Error("repository.rollback is required");
    this.repository=repository;
  }
  async rollback(ref, reason="manual") {
    return this.repository.rollback(ref,{reason,timestamp:new Date().toISOString()});
  }
}
