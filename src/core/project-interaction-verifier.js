function inspectHtml(html="",command="") {
  const source=String(html||"");
  const buttons=(source.match(/<button\\b/gi)||[]).length;
  const links=(source.match(/<a\\b/gi)||[]).length;
  const inputs=(source.match(/<input\\b/gi)||[]).length;
  const forms=(source.match(/<form\\b/gi)||[]).length;
  const canvas=(source.match(/<canvas\\b/gi)||[]).length;
  const interactive=buttons+links+inputs+forms+canvas;
  const game=/\\b(game|play|player|score|canvas|pong|card|memory|racing)\\b/i.test(command);
  const appHasScript=/<script\\b/i.test(source);
  const hasMainContent=/<(?:main|body|section|div)\\b/i.test(source);
  const expected=game ? canvas>0 : interactive>0;
  return {buttons,links,inputs,forms,canvas,interactive,game,appHasScript,hasMainContent,
    expectedInteractionSurface:game?"canvas/game surface":"interactive controls",
    passed:Boolean(hasMainContent&&appHasScript&&expected)};
}

function buildSmokeActions(command="",inspection={}) {
  const game=Boolean(inspection.game);
  if(game) return [
    {type:"goto",target:"/"},
    {type:"wait",ms:250},
    {type:"keyboard",key:"ArrowRight"},
    {type:"pointer",xRatio:0.65,yRatio:0.55},
    {type:"wait",ms:250},
    {type:"inspect",target:"body"}
  ];
  return [
    {type:"goto",target:"/"},
    {type:"wait",ms:150},
    {type:"click",selector:"button, a"},
    {type:"fill",selector:"input:not([type=hidden])",value:"Jora test"},
    {type:"submit",selector:"form"},
    {type:"inspect",target:"body"}
  ];
}

export function createProjectInteractionVerifier({
  runtimeVerifier=null,
  browser=null,
  fetchImpl=globalThis.fetch,
  timeoutMs=10000
}={}) {
  return async ({cwd,command="",specification=null}={})=>{
    if(!cwd) return {ok:false,mode:"none",error:"Project workspace is required"};

    if(browser?.verify) {
      const result=await browser.verify({
        cwd,command,specification,timeoutMs,
        actions:[]
      });
      return {ok:Boolean(result?.ok),mode:"BROWSER",...result};
    }

    if(typeof fetchImpl!=="function") return {ok:false,mode:"none",error:"fetch is unavailable"};

    const runtime=runtimeVerifier ? await runtimeVerifier({cwd}) : null;
    if(!runtime?.ok) return {ok:false,mode:"STATIC_INTERACTION_CONTRACT",runtime};

    const inspection=inspectHtml(runtime.bodyPreview||"",command);
    if(!inspection.passed) {
      return {ok:false,mode:"STATIC_INTERACTION_CONTRACT",inspection,runtime};
    }

    // No browser driver is installed in the current production image. Keep
    // this deterministic fallback explicit rather than claiming that clicks
    // were executed when they were not.
    return {
      ok:true,
      mode:"INTERACTION_CONTRACT",
      actions:buildSmokeActions(command,inspection),
      executed:false,
      inspection,
      runtime:{status:runtime.status,contentType:runtime.contentType}
    };
  };
}

export {inspectHtml,buildSmokeActions};
