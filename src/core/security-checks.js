import {SecurityGate} from "./security-gate.js";
import {SecurityCouncil} from "./security-council.js";

const SECRET_PATTERNS=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{12,}["']/i,
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/
];

export function createWorkspaceSecurityCouncil({repository}={}) {
  if(!repository) throw new Error("repository is required");
  const secrets=new SecurityGate({checks:[Object.defineProperty(async()=>{
    const files=await repository.list(); const findings=[];
    for(const file of files) {
      if(/(?:^|\/)(?:\.env|\.env\.[^/]+)$/.test(file)) findings.push(file);
      const content=await repository.read(file);
      if(SECRET_PATTERNS.some(pattern=>pattern.test(content))) findings.push(file);
    }
    return {passed:findings.length===0,findings};
  },"name",{value:"secret-and-sensitive-file-scan"})]});
  const paths=new SecurityGate({checks:[Object.defineProperty(async()=>{
    const files=await repository.list();
    const findings=files.filter(file=>file.split("/").some(part=>part==="node_modules"||part===".git"));
    return {passed:findings.length===0,findings};
  },"name",{value:"workspace-path-policy"})]});
  const scripts=new SecurityGate({checks:[Object.defineProperty(async()=>{
    const files=await repository.list(); const findings=[];
    for(const file of files.filter(file=>file==="package.json")) {
      const pkg=JSON.parse(await repository.read(file)); const scripts=pkg.scripts??{};
      for(const name of ["preinstall","install","postinstall"]) if(scripts[name]) findings.push(name);
    }
    return {passed:findings.length===0,findings};
  },"name",{value:"package-install-script-policy"})]});
  return new SecurityCouncil({gates:[secrets,paths,scripts],quorum:3});
}
