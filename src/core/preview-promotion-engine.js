export function createPreview(generation,testResult){
  const verified=Boolean(testResult?.final?.passed||testResult?.status==="PASSED"||testResult?.status==="REPAIRED");
  const files=(generation?.files||[]).map(file=>({path:file.path,size:String(file.content||"").length,taskId:file.taskId||"legacy"}));
  return {version:"1.0",status:verified?"PREVIEW_READY":"PREVIEW_BLOCKED",verified,entrypoint:files.some(f=>f.path==="src/index.html")?"src/index.html":null,files,createdAt:new Date().toISOString()};
}

export function evaluatePromotion(preview,testResult,{requireVerification=true}={}){
  const checks=[
    {id:"verification",passed:!requireVerification||Boolean(preview?.verified),message:"Generated project passed verification."},
    {id:"preview",passed:preview?.status==="PREVIEW_READY",message:"Preview artifact is ready."},
    {id:"files",passed:Array.isArray(preview?.files)&&preview.files.length>0,message:"Generated project contains files."}
  ];
  const passed=checks.every(check=>check.passed);
  return {status:passed?"PROMOTION_APPROVED":"PROMOTION_BLOCKED",approved:passed,checks,reason:passed?"All promotion gates passed.":checks.filter(c=>!c.passed).map(c=>c.message)};
}

export function promoteGeneration(generation,preview,promotion){
  if(!promotion?.approved) return {status:"NOT_PROMOTED",reason:promotion?.reason||["Promotion gate rejected the project."],generation};
  return {status:"PROMOTED",promotedAt:new Date().toISOString(),preview,generation};
}

export function previewAndPromote(generation,testResult,options={}){
  const preview=createPreview(generation,testResult);
  const promotion=evaluatePromotion(preview,testResult,options);
  return {preview,promotion,result:promoteGeneration(generation,preview,promotion)};
}
