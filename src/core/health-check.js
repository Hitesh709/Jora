export class HealthCheck {
  constructor({checkFn,attempts=3,intervalMs=2000}={}) {
    if(typeof checkFn!=="function") throw new Error("checkFn is required");
    this.checkFn=checkFn;
    this.attempts=Math.max(1,attempts);
    this.intervalMs=Math.max(0,intervalMs);
  }

  async check(input={}) {
    let last;
    for(let attempt=1;attempt<=this.attempts;attempt+=1) {
      try {
        const result=await this.checkFn(input);
        if(result?.passed) return {...result,attempt};
        last=result??{passed:false};
      } catch(error) {
        last={passed:false,error:error.message};
      }
      if(attempt<this.attempts) await new Promise(resolve=>setTimeout(resolve,this.intervalMs));
    }
    return {...last,passed:false,attempts:this.attempts};
  }
}
