export class JoraRuntime {
  constructor({builder,controller,continuousWorker=null}={}) {
    if (!builder || !controller) throw new Error("builder and controller are required");
    this.builder=builder; this.controller=controller; this.continuousWorker=continuousWorker;
  }
  async execute({command,constraints={},context={}}={}) {
    if (!command) throw new Error("command is required");
    const built=await this.builder.build({command,constraints,context});
    return this.controller.run({command,context:{...context,built}});
  }
  async improve({command,context={}}={}) {
    if (!this.continuousWorker) throw new Error("continuousWorker is not configured");
    return this.continuousWorker.run({command,context});
  }
  stop(){this.controller.stop(); this.continuousWorker?.stop();}
}
