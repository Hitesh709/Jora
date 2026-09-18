export class ProviderRegistry {
  constructor({providers = {}} = {}) { this.providers = new Map(Object.entries(providers)); }
  register(name, provider) {
    if (!name || !provider || typeof provider.complete !== "function") throw new Error("provider name and complete() are required");
    this.providers.set(name, provider);
  }
  get(name) {
    const provider=this.providers.get(name);
    if (!provider) throw new Error(`provider not registered: ${name}`);
    return provider;
  }
  list() { return [...this.providers.keys()]; }
}
