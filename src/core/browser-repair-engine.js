import fs from "node:fs/promises";
import path from "node:path";
import {runInteractionTests} from "./interaction-testing-engine.js";
import {verifyWorkspacePreview} from "./browser-verification-engine.js";

function failedChecks(interactions){
  return (interactions?.checks||[]).filter(check=>!check.passed);
}

export function analyzeInteractionFailure(interactions,scenarioPlan){
  const failures=failedChecks(interactions);
  const scenarios=scenarioPlan?.scenarios||[];
  return {
    type:"browser-interaction-failure",
    status:interactions?.status||"UNKNOWN",
    url:interactions?.url||null,
    consoleErrors:interactions?.consoleErrors||[],
    pageErrors:interactions?.pageErrors||[],
    failures:failures.map(check=>({
      name:check.name,
      error:check.error||null,
      result:check.result||null
    })),
    scenarios:scenarios.map(s=>({id:s.id,name:s.name,actions:s.actions||[]}))
  };
}

function hasSelector(content,selector){
  if(/input\[type=search\]/i.test(selector)) return /<input[^>]+type=["']search["']/i.test(content);
  if(/placeholder\*=['"]search/i.test(selector)) return /placeholder=["'][^"']*search/i.test(content);
  if(/input\[type=email\]/i.test(selector)) return /<input[^>]+type=["']email["']/i.test(content);
  if(/input\[type=password\]/i.test(selector)) return /<input[^>]+type=["']password["']/i.test(content);
  if(/#start/i.test(selector)) return /id=["']start["']/i.test(content);
  if(/button/i.test(selector)) return /<button\b/i.test(content);
  return true;
}

function selectorFromFailure(failure){
  const text=String(failure?.error||"");
  const selectors=[
    /locator\((?:'|")(.*?)(?:'|")\)/i,
    /waiting for locator\((?:'|")(.*?)(?:'|")\)/i
  ];
  for(const re of selectors){
    const match=text.match(re);
    if(match?.[1]) return match[1];
  }
  return null;
}

export function createBrowserRepairPatch(failure,{workspaceFiles=[]}={}){
  const htmlFile=workspaceFiles.find(file=>file.path==="src/index.html");
  if(!htmlFile) return {strategy:"browser-targeted-patch",patches:[],diagnosis:failure};
  const content=String(htmlFile.content);
  const patches=[];
  const selectors=[];
  for(const item of failure.failures||[]){
    const selector=selectorFromFailure(item);
    if(selector) selectors.push(selector);
  }

  const add=(html,reason)=>{
    if(!content.includes(html.replace(/\s+/g," ").trim())) patches.push({
      path:"src/index.html",operation:"insert-before-body-close",content:html,reason
    });
  };

  if(selectors.some(s=>/input\[type=search\]|placeholder.*search/i.test(s)) &&
     !selectors.every(s=>hasSelector(content,s))){
    add('<div data-jora-repair="search"><input type="search" placeholder="Search" aria-label="Search"></div>',
      "Restore the search control required by the generated search scenario.");
  }

  if(selectors.some(s=>/input\[type=email\]/i.test(s)) && !hasSelector(content,"input[type=email]")){
    add('<div data-jora-repair="auth"><input type="email" name="email" placeholder="Email"><input type="password" name="password" placeholder="Password"><button type="submit">Sign in</button></div>',
      "Restore the authentication controls required by the generated sign-in scenario.");
  } else if(selectors.some(s=>/input\[type=password\]/i.test(s)) && !hasSelector(content,"input[type=password]")){
    add('<div data-jora-repair="auth"><input type="email" name="email" placeholder="Email"><input type="password" name="password" placeholder="Password"><button type="submit">Sign in</button></div>',
      "Restore the authentication controls required by the generated sign-in scenario.");
  }

  if(selectors.some(s=>/#start/i.test(s)) && !hasSelector(content,"#start")){
    add('<button id="start" type="button">Start</button>',
      "Restore the game start control required by the generated game scenario.");
  }

  return {strategy:"browser-targeted-patch",patches,diagnosis:failure};
}

async function applyBrowserRepairPatch(root,patch){
  const safe=String(patch.path||"").replace(/^[/\\]+/,"");
  if(!safe||safe.split(/[\\/]/).includes("..")) throw new Error("unsafe browser repair path");
  const target=path.join(root,safe);
  const content=await fs.readFile(target,"utf8");
  if(patch.operation!=="insert-before-body-close") throw new Error("unsupported browser repair operation");
  if(content.includes(patch.content)) return {applied:false,path:safe};
  const marker=content.lastIndexOf("</body>");
  if(marker<0) return {applied:false,path:safe,error:"</body> not found"};
  const next=content.slice(0,marker)+patch.content+content.slice(marker);
  await fs.writeFile(target,next,"utf8");
  return {applied:true,path:safe};
}

export async function runBrowserRepairLoop(root,scenarioPlan,{
  preview,
  maxAttempts=2,
  runTests,
  readFile,
  startPreview,
  stopPreview,
  initialInteractions=null
}={}){
  if(typeof runTests!=="function"||typeof readFile!=="function") throw new Error("runTests and readFile are required");
  if(typeof startPreview!=="function"||typeof stopPreview!=="function") throw new Error("startPreview and stopPreview are required");

  let currentPreview=preview;
  let interactions=initialInteractions||await runInteractionTests(currentPreview.url,{tests:scenarioPlan.scenarios});
  let browser=await verifyWorkspacePreview(currentPreview.url);
  let attempts=0;
  const history=[];

  while(
    (interactions.status==="INTERACTION_FAILED"||browser.status!=="BROWSER_VERIFIED") &&
    interactions.status!=="BROWSER_UNAVAILABLE" &&
    browser.status!=="BROWSER_UNAVAILABLE" &&
    attempts<maxAttempts
  ){
    attempts++;
    const failure=analyzeInteractionFailure(interactions,scenarioPlan);
    const html=await readFile(root,"src/index.html");
    const plan=createBrowserRepairPatch(failure,{workspaceFiles:[{path:"src/index.html",content:html}]});
    const applied=[];
    for(const patch of plan.patches) applied.push(await applyBrowserRepairPatch(root,patch));

    history.push({attempt:attempts,failure,plan,applied});
    if(!applied.some(item=>item.applied)) break;

    const tests=await runTests(root);
    if(!tests.passed){
      history[history.length-1].postRepairTests=tests;
      break;
    }

    await stopPreview(currentPreview);
    currentPreview=await startPreview(root);
    if(currentPreview.status!=="PREVIEW_RUNNING") break;

    browser=await verifyWorkspacePreview(currentPreview.url);
    if(browser.status==="BROWSER_UNAVAILABLE") break;
    interactions=await runInteractionTests(currentPreview.url,{tests:scenarioPlan.scenarios});
  }

  const repaired=interactions.status==="INTERACTION_VERIFIED"&&browser.status==="BROWSER_VERIFIED";
  return {
    status:repaired?"BROWSER_REPAIRED":(
      interactions.status==="BROWSER_UNAVAILABLE"||browser.status==="BROWSER_UNAVAILABLE"
        ?"BROWSER_UNAVAILABLE":"BROWSER_REPAIR_FAILED"
    ),
    repaired,
    attempts,
    preview:currentPreview,
    browser,
    interactions,
    history
  };
}
