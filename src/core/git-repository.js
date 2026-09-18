export class GitRepositoryAdapter {
  constructor({client}={}) {
    if (!client) throw new Error("client is required");
    this.client=client;
  }

  async read(path) { return this.client.read(path); }
  async write(path, content, expectedSha) { return this.client.write(path, content, expectedSha); }
  async list(prefix="") { return this.client.list(prefix); }
  async search(query) { return this.client.search(query); }
  async commit(message, changes) { return this.client.commit(message, changes); }
  async rollback(ref) { return this.client.rollback(ref); }
}
