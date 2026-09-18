const SECRET_PATTERNS=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{12,}["']/i,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/
];
const DANGEROUS_PATTERNS=[
  /child_process\.(?:exec|execSync)\s*\(/,
  /new Function\s*\(/,
  /eval\s*\(/,
  /(?:curl|wget)\s+[^\n]*\|\s*(?:sh|bash)/i
];

export class SecurityIntelligence {
  constructor({repository=null,config={}}={}) { this.repository=repository; this.config={maxFindings:100,...config}; }
  async scan({files=null}={}) {
    if(!this.repository) throw new Error("repository is required");
    const paths=files??await this.repository.list();
    const findings=[];
    for(const file of paths) {
      if(findings.length>=this.config.maxFindings) break;
      let content="";
      try { const value=await this.repository.read(file);content=typeof value==="string"?value:value?.content??""; } catch { continue; }
      if(SECRET_PATTERNS.some(p=>p.test(content))) findings.push({type:"SECRET",severity:"CRITICAL",file});
      if(this.config.scanCode!==false && DANGEROUS_PATTERNS.some(p=>p.test(content))) findings.push({type:"DANGEROUS_CODE",severity:"HIGH",file});
    }
    const packageFile=paths.find(x=>x==="package.json");
    if(packageFile) {
      try {
        const pkg=JSON.parse(typeof (await this.repository.read(packageFile))==="string" ? await this.repository.read(packageFile) : (await this.repository.read(packageFile))?.content ?? "");
        for(const name of ["preinstall","install","postinstall"]) if(pkg.scripts?.[name]) findings.push({type:"INSTALL_SCRIPT",severity:"HIGH",file:packageFile,detail:name});
        if(pkg.dependencies?.["shelljs"] || pkg.dependencies?.["zx"]) findings.push({type:"COMMAND_TOOL_DEPENDENCY",severity:"MEDIUM",file:packageFile});
      } catch(error) { findings.push({type:"INVALID_PACKAGE",severity:"HIGH",file:packageFile,detail:error.message}); }
    }
    return {passed:findings.length===0,findings,scannedFiles:paths.length};
  }
  async checkRuntime({sandbox=null,network="none"}={}) {
    const findings=[];
    if(!sandbox) findings.push({type:"SANDBOX_MISSING",severity:"CRITICAL"});
    if(network!=="none") findings.push({type:"SANDBOX_NETWORK_ENABLED",severity:"HIGH",network});
    return {passed:findings.length===0,findings};
  }
}
