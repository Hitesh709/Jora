export class AccessController {
  constructor({tokens={},defaultTenant="default"}={}) {
    this.tokens=new Map(Object.entries(tokens)); this.defaultTenant=defaultTenant;
  }
  authenticate(token) {
    if(!token) return null;
    const principal=this.tokens.get(token);
    return principal?{...principal}:null;
  }
  authorize(principal,action) {
    if(!principal) return false;
    const roles=principal.roles||[];
    if(roles.includes("admin")) return true;
    const permissions={read:["read"],execute:["execute"],operate:["read","execute","operate"]};
    return roles.some(role=>(permissions[role]||[]).includes(action));
  }
  tenant(principal){return principal?.tenantId||this.defaultTenant;}
}
