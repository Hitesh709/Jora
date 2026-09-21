import {chromium} from "playwright-core";

function selectorOrNull(value) {
  return value ? String(value) : null;
}

export function createPlaywrightBrowserDriver({
  executablePath=process.env.JORA_BROWSER_EXECUTABLE||"/usr/bin/chromium",
  timeoutMs=10000,
  headless=true
}={}) {
  return {
    async verify({cwd,command="",actions=[]}={}) {
      if(!cwd) return {ok:false,error:"Project workspace is required",actionsExecuted:[]};

      let browser;
      const actionsExecuted=[];
      const errors=[];
      try {
        browser=await chromium.launch({
          executablePath,
          headless,
          args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]
        });
        const context=await browser.newContext({
          viewport:{width:1280,height:800},
          serviceWorkers:"block"
        });
        const page=await context.newPage();
        page.setDefaultTimeout(timeoutMs);

        page.on("pageerror",error=>errors.push("pageerror: "+error.message));
        page.on("console",message=>{
          if(message.type()==="error") errors.push("console: "+message.text());
        });

        const baseUrl=String(started?.url||process.env.JORA_INTERACTION_BASE_URL||"http://127.0.0.1:4173").replace(/\\/$/,"");

        for(const action of actions) {
          switch(action.type) {
            case "goto":
              await page.goto(baseUrl+(action.target||"/"),{waitUntil:"domcontentloaded"});
              actionsExecuted.push(action.type);
              break;
            case "wait":
              await page.waitForTimeout(Math.max(0,Number(action.ms)||0));
              actionsExecuted.push(action.type);
              break;
            case "click": {
              const selector=selectorOrNull(action.selector);
              const locator=selector ? page.locator(selector).first() : null;
              if(locator) {
                await locator.click();
                actionsExecuted.push("click");
              }
              break;
            }
            case "fill": {
              const selector=selectorOrNull(action.selector);
              if(selector) {
                const locator=page.locator(selector).first();
                if(await locator.count()) {
                  await locator.fill(String(action.value??""));
                  actionsExecuted.push("fill");
                }
              }
              break;
            }
            case "submit": {
              const selector=selectorOrNull(action.selector);
              if(selector) {
                const locator=page.locator(selector).first();
                if(await locator.count()) {
                  await locator.evaluate(form=>form.requestSubmit());
                  actionsExecuted.push("submit");
                }
              }
              break;
            }
            case "keyboard":
              await page.keyboard.press(String(action.key));
              actionsExecuted.push("keyboard");
              break;
            case "pointer": {
              const box=await page.locator("body").boundingBox();
              if(box) {
                await page.mouse.move(box.x+box.width*(Number(action.xRatio)||0.5),box.y+box.height*(Number(action.yRatio)||0.5));
                await page.mouse.down();
                await page.mouse.up();
                actionsExecuted.push("pointer");
              }
              break;
            }
            case "inspect": {
              const body=await page.locator("body").innerText().catch(()=> "");
              if(!body.trim()) throw new Error("Application body is empty");
              actionsExecuted.push("inspect");
              break;
            }
          }
        }

        const title=await page.title();
        const bodyText=(await page.locator("body").innerText()).slice(0,2000);
        return {
          ok:errors.length===0,
          mode:"BROWSER",
          title,
          bodyText,
          actionsExecuted,
          errors
        };
      } catch(error) {
        return {
          ok:false,
          mode:"BROWSER",
          actionsExecuted,
          errors:[...errors,error.message]
        };
      } finally {
        await browser?.close().catch(()=>{});\n        await started?.stop?.().catch(()=>{});
      }
    }
  };
}
