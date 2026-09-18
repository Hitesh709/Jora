export class SelfInspector {
  constructor({repository, capabilityProvider} = {}) {
    if (!repository) throw new Error("repository is required");
    this.repository = repository;
    this.capabilityProvider = capabilityProvider ?? (async () => ({}));
  }

  async inspect(context = {}) {
    const files = await this.repository.list?.("") ?? [];
    const capabilities = await this.capabilityProvider(context);
    const knownIssues = context.knownIssues ?? [];
    return {
      timestamp: new Date().toISOString(),
      files,
      capabilities,
      knownIssues
    };
  }
}
