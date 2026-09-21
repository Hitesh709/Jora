function extractFailureFiles(text="") {
  const files=new Set();
  const source=String(text);
  const patterns=[
    /(?:at |FAIL |Error in )((?:src|test|tests|app|pages|components|lib|server|client)[\\/][^\\s:()]+\\.(?:js|jsx|ts|tsx|mjs|cjs|html|css))/g,
    /((?:src|test|tests|app|pages|components|lib|server|client)[\\/][^\\s:()]+\\.(?:js|jsx|ts|tsx|mjs|cjs|html|css)):\\d+(?::\\d+)?/g
  ];
  for(const pattern of patterns){
    for(const match of source.matchAll(pattern)) files.add(match[1].replaceAll("\\\\","/"));
  }
  return [...files].slice(0,20);
}

export function createProjectTestRunner({sandbox}) {
  if(!sandbox) throw new Error("sandbox is required");
  return async ({cwd,commandArgs=["test"]}={})=>{
    if(!cwd) return {ok:false,stderr:"Project workspace is required",files:[]};
    const result=await sandbox.run({cwd,command:"npm",commandArgs});
    const combined=String(result.stderr??"")+"\n"+String(result.stdout??"");
    return {
      ok:result.ok,
      stdout:result.stdout,
      stderr:result.stderr,
      code:result.code,
      files:extractFailureFiles(combined)
    };
  };
}
