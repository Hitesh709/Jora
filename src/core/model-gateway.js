export class ModelGateway {
  constructor({ providers = new Map(), defaultModel = "default" } = {}) {
    this.providers = providers;
    this.defaultModel = defaultModel;
  }

  register(name, provider) {
    if (!name || !provider?.complete) throw new Error("Valid provider is required");
    this.providers.set(name, provider);
  }

  async complete(request) {
    const model = request.model ?? this.defaultModel;
    const provider = this.providers.get(model);
    if (!provider) throw new Error(`No model provider registered: ${model}`);
    const started = Date.now();
    const result = await provider.complete(request);
    return { ...result, model, latencyMs: Date.now() - started };
  }
}