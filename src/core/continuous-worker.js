export class ContinuousWorker {
  constructor({cycle, intervalMs=60_000, maxCycles=Infinity}={}) {
    if (!cycle) throw new Error("cycle is required");
    this.cycle=cycle; this.intervalMs=intervalMs; this.maxCycles=maxCycles;
    this.running=false; this.cycles=0;
  }

  async run({command,context={}}={}) {
    if (this.running) throw new Error("worker already running");
    this.running=true; this.cycles=0;
    try {
      while (this.running && this.cycles < this.maxCycles) {
        this.cycles += 1;
        await this.cycle({cycle:this.cycles,command,context});
        if (!this.running || this.cycles >= this.maxCycles) break;
        await new Promise(resolve=>setTimeout(resolve,this.intervalMs));
      }
    } finally { this.running=false; }
    return {cycles:this.cycles};
  }

  stop() { this.running=false; }
}
