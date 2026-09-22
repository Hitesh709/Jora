import fs from "node:fs/promises";

async function findBrowserExecutable(){
  const candidates=[
    process.env.JORA_BROWSER_EXECUTABLE,
    process.env.CHROME_BIN,
    process.env.CHROMIUM_BIN,
    process.platform==="win32"?"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe":null,
    process.platform==="win32"?"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe":null,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  for(const candidate of candidates){
    try{await fs.access(candidate);return candidate;}catch{}
  }
  return null;
}

export async function verifyWorkspacePreview(url,{timeout=15000}={}){
  const executablePath=await findBrowserExecutable();
  if(!executablePath){
    return {status:"BROWSER_UNAVAILABLE",verified:false,url,reason:"No Chromium/Chrome executable found. Set JORA_BROWSER_EXECUTABLE, CHROME_BIN, or CHROMIUM_BIN."};
  }

  try{
    const {chromium}=await import("playwright-core");
    const browser=await chromium.launch({headless:true,executablePath});
    try{
      const page=await browser.newPage();
      const consoleErrors=[];
      const pageErrors=[];
      page.on("console",message=>{if(message.type()==="error") consoleErrors.push(message.text());});
      page.on("pageerror",error=>pageErrors.push(error.message));
      await page.goto(url,{waitUntil:"networkidle",timeout});
      const result=await page.evaluate(()=>{
        const body=document.body;
        return {
          title:document.title,
          hasContent:Boolean(body?.innerText?.trim()),
          errorOverlay:Boolean(document.querySelector("[data-nextjs-dialog],.vite-error-overlay,#webpack-dev-server-client-overlay")),
          interactiveElements:document.querySelectorAll("button,a,input,select,textarea,[role=button]").length,
          bodyText:(body?.innerText||"").trim().slice(0,1000)
        };
      });
      const verified=result.hasContent&&!result.errorOverlay&&!consoleErrors.length&&!pageErrors.length;
      return {
        status:verified?"BROWSER_VERIFIED":"BROWSER_FAILED",
        verified,
        url,
        executablePath,
        ...result,
        consoleErrors,
        pageErrors
      };
    }finally{
      await browser.close();
    }
  }catch(error){
    return {status:"BROWSER_FAILED",verified:false,url,error:error.message};
  }
}
