export class CodeMaster {
  constructor({ repository }={}) {
    if (!repository) throw new Error("Repository adapter is required");
    this.repository=repository;
  }
  async inspect(path="") { return this.repository.list(path); }
  async read(path) { return this.repository.read(path); }
  async write(path, content, expectedSha=null) { return this.repository.write(path,content,expectedSha); }
  async search(query) { return this.repository.search(query); }
}