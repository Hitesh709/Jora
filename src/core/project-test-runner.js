export function createProjectTestRunner({sandbox}) {
  if(!sandbox) throw new Error("sandbox is required");
  return async ({cwd,commandArgs=["test"]}={})=>{
    if(!cwd) return {ok:false,stderr:"Project workspace is required"};
    const result=await sandbox.run({cwd,command:"npm",commandArgs});
    return {ok:result.ok,stdout:result.stdout,stderr:result.stderr,code:result.code};
  };
}
