import fs from "node:fs/promises";

async function findBrowserExecutable(){
  const candidates=[
    process.env.JORA_BROWSER_EXECUTABLE,process.env.CHROME_BIN,process.env.CHROMIUM_BIN,
    process.platform==="win32"?"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe":null,
    process.platform==="win32"?"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe":null,
    "/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"
  ].filter(Boolean);
  for(const candidate of candidates){try{await fs.access(candidate);return candidate;}catch{}}
  return null;
}

function selectorsFor(page){
  return page.locator("button,a,input,select,textarea,[role=button]");
}

async function inspectPage(page){
  return page.evaluate(()=>({
    title:document.title,
    url:location.href,
    hasContent:Boolean(document.body?.innerText?.trim()),
    errorOverlay:Boolean(document.querySelector("[data-nextjs-dialog],.vite-error-overlay,#webpack-dev-server-client-overlay")),
    bodyText:(document.body?.innerText||"").trim().slice(0,1500),
    links:[...document.querySelectorAll("a")].slice(0,20).map(a=>({text:a.innerText.trim(),href:a.href})),
    forms:document.querySelectorAll("form").length
  }));
}

export async function runInteractionTests(url,{timeout=15000,tests=[]}={}){
  const executablePath=await findBrowserExecutable();
  if(!executablePath)return {status:"BROWSER_UNAVAILABLE",verified:false,url,tests:[],reason:"No Chromium/Chrome executable found."};
  try{
    const {chromium}=await import("playwright-core");
    const browser=await chromium.launch({headless:true,executablePath});
    try{
      const page=await browser.newPage();
      const consoleErrors=[],pageErrors=[];
      page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text());});
      page.on("pageerror",e=>pageErrors.push(e.message));
      await page.goto(url,{waitUntil:"networkidle",timeout});
      const checks=[];
      const run=async(name,fn)=>{
        try{const result=await fn();checks.push({name,passed:true,result});}
        catch(error){checks.push({name,passed:false,error:error.message});}
      };

      await run("page-load",async()=>inspectPage(page));
      await run("interactive-elements",async()=>{
        const count=await selectorsFor(page).count();
        if(count===0)throw new Error("No interactive elements found");
        return {count};
      });

      for(const spec of tests){
        await run(spec.name||"custom-interaction",async()=>{
          const action=spec.action||"click";
          const locator=page.locator(spec.selector).first();
          if(action==="click"){await locator.click({timeout});}
          else if(action==="fill"){await locator.fill(String(spec.value??""),{timeout});}
          else if(action==="press"){await locator.press(String(spec.value||"Enter"),{timeout});}
          else if(action==="select"){await locator.selectOption(String(spec.value),{timeout});}
          else if(action==="expect-text"){
            const text=await page.locator(spec.selector).first().innerText({timeout});
            if(!text.includes(String(spec.value)))throw new Error("Expected text not found: "+spec.value);
          }else if(action==="navigate"){await page.goto(String(spec.value),{waitUntil:"networkidle",timeout});}
          else throw new Error("Unsupported interaction action: "+action);
        });
      }

      const final=await inspectPage(page);
      const failed=checks.filter(x=>!x.passed);
      const verified=!final.errorOverlay&&final.hasContent&&!consoleErrors.length&&!pageErrors.length&&!failed.length;
      return {
        status:verified?"INTERACTION_VERIFIED":"INTERACTION_FAILED",
        verified,url,checks,final,consoleErrors,pageErrors
      };
    }finally{await browser.close();}
  }catch(error){return {status:"INTERACTION_FAILED",verified:false,url,error:error.message,checks:[]};}
}
