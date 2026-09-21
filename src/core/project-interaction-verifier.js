function inspectHtml(html="",command="") {
  const source=String(html||"");
  const lower=source.toLowerCase();
  const buttons=(source.match(/<button\b/gi)||[]).length;
  const links=(source.match(/<a\b/gi)||[]).length;
  const inputs=(source.match(/<input\b/gi)||[]).length;
  const forms=(source.match(/<form\b/gi)||[]).length;
  const canvas=(source.match(/<canvas\b/gi)||[]).length;
  const interactive=buttons+links+inputs+forms+canvas;
  const game=/\b(game|play|player|score|canvas|pong|card|memory|racing)\b/i.test(command);
  const appHasScript=/<script\b/i.test(source);
  const hasMainContent=/<(?:main|body|section|div)\b/i.test(source);
  const expected=game ? canvas>0 : interactive>0;
  return {
    buttons,links,inputs,forms,canvas,interactive,
    game,
    appHasScript,
    hasMainContent,
    expectedInteractionSurface:game?"canvas/game surface":"interactive controls",
    passed:Boolean(hasMainContent&&appHasScript&&expected)
  };
}

export function createProjectInteractionVerifier({
  runtimeVerifier=null,
  browser=null,
  fetchImpl=globalThis.fetch,
  timeoutMs=10000
}={}) {
  return async ({cwd,command=""}={})=>{
    if(!cwd) return {ok:false,mode:"none",error:"Project workspace is required"};

    if(browser?.verify) {
      const result=await browser.verify({cwd,command,timeoutMs});
      return {
        ok:Boolean(result?.ok),
        mode:"BROWSER",
        ...result
      };
    }

    if(typeof fetchImpl!=="function") {
      return {ok:false,mode:"none",error:"fetch is unavailable"};
    }

    // RuntimeVerifier owns process lifecycle. This fallback deliberately does
    // not pretend to click a UI; it validates that the live page exposes the
    // interaction surface required by the requested product.
    const runtime=runtimeVerifier
      ? await runtimeVerifier({cwd})
      : null;
    if(!runtime?.ok) {
      return {ok:false,mode:"STATIC_INTERACTION_CONTRACT",runtime};
    }

    const inspection=inspectHtml(runtime.bodyPreview||"",command);
    return {
      ok:inspection.passed,
      mode:"STATIC_INTERACTION_CONTRACT",
      inspection,
      runtime:{status:runtime.status,contentType:runtime.contentType}
    };
  };
}

export {inspectHtml};
