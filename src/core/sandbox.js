export class Sandbox {
  constructor({ executor, limits = {} } = {}) {
    if (typeof executor !== "function") throw new Error("Sandbox executor is required");
    this.executor = executor;
    this.limits = {
      timeoutMs: limits.timeoutMs ?? 30_000,
      maxOutputBytes: limits.maxOutputBytes ?? 1_000_000
    };
  }

  async run(command, options = {}) {
    if (!command?.trim()) throw new Error("Command is required");
    const timeoutMs = Math.min(options.timeoutMs ?? this.limits.timeoutMs, this.limits.timeoutMs);
    const started = Date.now();

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Sandbox timeout")), timeoutMs)
    );

    const result = await Promise.race([this.executor(command, options), timeout]);
    const output = JSON.stringify(result ?? "");
    if (Buffer.byteLength(output) > this.limits.maxOutputBytes) {
      throw new Error("Sandbox output limit exceeded");
    }
    return { result, durationMs: Date.now() - started };
  }
}