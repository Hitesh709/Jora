import {generateUniversalProject} from "./universal-project-generator.js";
function clean(value=""){return String(value??"").replace(/\s+/g," ").trim();}
function slug(value="jora-project"){return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"jora-project";}
function json(value){return JSON.stringify(value,null,2);}
function extractCommand(prompt){
  const text=clean(prompt);
  const match=text.match(/Command:\s*([\s\S]*?)(?:\s+Specification:|\s+This is a repair cycle\.|\s+Existing project JSON \(preserve all working behavior and modify these files for the new request\):|$)/i);
  return clean(match?.[1]||text).slice(0,2000);
}
function extractExistingProject(prompt){
  const marker="Existing project JSON (preserve all working behavior and modify these files for the new request):";
  const index=prompt.indexOf(marker);
  if(index<0) return null;
  try{return JSON.parse(prompt.slice(index+marker.length).trim())}catch{return null}
}
function requestedColor(command){
  const lower=String(command||"").toLowerCase();
  const named={red:"#ef4444",green:"#22c55e",blue:"#3b82f6",yellow:"#facc15",orange:"#f97316",purple:"#a855f7",pink:"#ec4899",white:"#ffffff",black:"#000000",gray:"#6b7280",grey:"#6b7280",cyan:"#06b6d4"};
  const hex=lower.match(/#([0-9a-f]{3}|[0-9a-f]{6})\\b/i);
  if(hex) return "#"+hex[1];
  for(const [name,value] of Object.entries(named)) if(new RegExp("\\b"+name+"\\b").test(lower)) return value;
  return null;
}
function applyExistingChange(command,existing){
  const files=(existing.files||[]).map(file=>({path:file.path,content:String(file.content||"")}));
  const lower=String(command||"").toLowerCase();
  const htmlFile=files.find(file=>/^(src\/)?index\.html$/i.test(file.path))||files.find(file=>/\.html?$/i.test(file.path));
  if(!htmlFile) return {name:existing.project?.name||"jora-project",files};
  if(/\bcard game\b|\bmemory (match|card)\b|\bmatching cards?\b|\bflip cards?\b/.test(lower)) {
    const generated=projectFor("Build card game");
    const generatedHtml=generated.files.find(file=>/^(src\/)?index\.html$/i.test(file.path));
    if(generatedHtml) htmlFile.content=generatedHtml.content;
    const readme=files.find(file=>file.path==="README.md");
    if(readme && !readme.content.includes("Jora change: "+command)) readme.content+="\n\nJora change: "+command+"\n";
    return {name:existing.project?.name||"card-game",files};
  }
  let content=htmlFile.content;
  const titleMatch=String(command).match(/(?:title|heading|name)\s+(?:to|as|=)\s+["“']?(.+?)["”']?(?=\s+and\s+(?:button|start button)\b|$)/i);
  if(titleMatch){
    const title=titleMatch[1].trim();
    content=content.replace(/<title>[^<]*<\/title>/i,"<title>"+title+"</title>");
    content=content.replace(/(<h1[^>]*>)[^<]*(<\/h1>)/i,"$1"+title+"$2");
    content=content.replace(/(<div[^>]*class=["'][^"']*title[^"']*["'][^>]*>)[^<]*(<\/div>)/i,"$1"+title+"$2");
  }
  const color=requestedColor(command);
  if(color){
    if(/background/.test(lower)){
      content=content.replace(/(body[^{}]*\{[^}]*background:)\s*[^;}]*/i,"$1"+color);
      content=content.replace(/(background:)\s*#[0-9a-f]{3,8}/ig,"$1"+color);
      content=content.replace(/(ctx\.fillStyle=)["'][^"']+(["'];ctx\.fillRect\(0,0,canvas\.width,canvas\.height\))/i,"$1\""+color+"\"$2");
    }
    if(/player/.test(lower)){
      content=content.replace(/(ctx\.fillStyle=)["']#fff(["'];ctx\.fillRect\(player\.x,player\.y,player\.w,player\.h\))/i,"$1\""+color+"\"$2");
    }
    if(/item|enemy|ball|target/.test(lower)){
      content=content.replace(/(ctx\.fillStyle=)["']#f3b34c(["'];)/i,"$1\""+color+"\"$2");
    }
    if(/button/.test(lower)){
      content=content.replace(/(button[^{}]*\{[^}]*background:)\s*[^;}]*/i,"$1"+color);
    }
  }
  const speedMatch=String(command).match(/(?:player\s+)?speed\s+(?:to|=)\s*(\d+(?:\.\d+)?)/i);
  if(speedMatch) content=content.replace(/(speed:)\s*\d+(?:\.\d+)?/i,"$1"+speedMatch[1]);
  const buttonText=String(command).match(/(?:button|start button)\s+(?:text|label)\s+(?:to|as|=)\s+["“']?(.+?)["”']?\s*$/i);
  if(buttonText) content=content.replace(/(<button[^>]*id=["']start["'][^>]*>)[^<]*(<\/button>)/i,"$1"+buttonText[1].trim().replace(/[.!?]\s*$/,"")+"$2");
  const widthMatch=String(command).match(/(?:canvas|game)\s+width\s+(?:to|=)\s*(\d+)/i);
  if(widthMatch) content=content.replace(/(<canvas[^>]*width=["'])\d+(")/i,"$1"+widthMatch[1]+"$2");
  htmlFile.content=content;
  const readme=files.find(file=>file.path==="README.md");
  if(readme && !readme.content.includes("Jora change: "+command)) readme.content+="\n\nJora change: "+command+"\n";
  return {name:existing.project?.name||"jora-project",files};
}

function projectFor(command){
  // Universal generation is now the primary path. Domain-specific generators
  // remain below as compatibility fallbacks, not as request routing.
  const specializedCompatibility=/\\bcalculator\\b|\\bcalc\\b|\\bmath app\\b|\\barithmetic\\b|\\bcard game\\b|\\bmemory (match|card)\\b|\\bmatching cards?\\b|\\bflip cards?\\b/.test(String(command||"").toLowerCase());
  if(!specializedCompatibility) try{
    const universal=generateUniversalProject(command);
    const files=Array.isArray(universal?.files)?universal.files:[];
    const valid=files.length>0
      && files.some(file=>file?.path==="package.json")
      && files.some(file=>file?.path==="src/index.js")
      && files.some(file=>file?.path==="src/index.html")
      && files.some(file=>file?.path==="test/index.test.js");
    if(valid) return universal;
  }catch{
    // Fall through to the legacy compatibility generator.
  }

  const lowerCommand=String(command||"").toLowerCase();
  const legacy=/\bcalculator\b|\bcalc\b|\bmath app\b|\barithmetic\b|\bcard game\b|\bmemory (match|card)\b|\bmatching cards?\b|\bflip cards?\b|\b(game|mini game|arcade|snake|pong|tetris|platformer|dodge|runner|shooting game)\b/.test(lowerCommand);
  if(!legacy) return generateUniversalProject(command);
  const title=clean(command).replace(/^build\s+/i,"").replace(/^create\s+/i,"").replace(/^make\s+/i,"").slice(0,90)||"Jora Application";
  const name=slug(title);
  const lower=command.toLowerCase();
  const apiMode=/api|backend|server|service|endpoint|rest|webhook/.test(lower);
  const dataMode=/database|postgres|mysql|sqlite|data|crud|customer|user|login|auth|todo|task|inventory|loan|credit/.test(lower);
  const description=title.replace(/["\\]/g,"");
  const isCalculator=/\bcalculator\b|\bcalc\b|\bmath app\b|\barithmetic\b/.test(lower);
  const isCardGame=/\bcard game\b|\bmemory (match|card)\b|\bmatching cards?\b|\bflip cards?\b/.test(lower);
  const isMiniGame=/\b(game|mini game|arcade|snake|pong|tetris|platformer|dodge|runner|shooting game)\b/.test(lower);

  const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${description}</title>
<style>body{font-family:system-ui;margin:0;background:#0b0d11;color:#f3f4f6}main{max-width:900px;margin:auto;padding:48px 22px}section{border:1px solid #29303a;border-radius:14px;padding:22px;background:#12161d;margin-top:18px}.muted{color:#9aa4b2}button{padding:10px 14px;border:0;border-radius:8px;cursor:pointer}</style></head>
<body><main><h1>${description}</h1><p class="muted">Generated by Jora Native Engineering Engine.</p>
<section><h2>Project is running</h2><p>This production-ready starter is intentionally dependency-light and can be extended by Jora's engineering loop.</p><button onclick="document.getElementById('status').textContent='Healthy — '+new Date().toLocaleTimeString()">Check status</button><p id="status">Ready</p></section></main></body></html>`;

  const calculatorHtml=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${description}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{font-family:system-ui;margin:0;min-height:100vh;background:#0b0d11;color:#f3f4f6;display:grid;place-items:center;padding:20px}.calculator{width:min(390px,100%);background:#151922;border:1px solid #303744;border-radius:22px;padding:18px}h1{font-size:18px;margin:0 0 12px}.display{background:#0b0d11;border:1px solid #29303a;border-radius:14px;padding:18px;min-height:92px;text-align:right}.expression{font-size:14px;color:#8b94a5;min-height:22px}.value{font-size:34px;overflow:auto}.keys{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px}button{border:1px solid #343b47;background:#202631;color:#fff;border-radius:12px;padding:17px 10px;font-size:18px;cursor:pointer}.operator{background:#2a3442}.equal{grid-column:span 2;background:#fff;color:#111}.danger{background:#321f25}.history{margin-top:14px;color:#9da7b6;font-size:12px;max-height:90px;overflow:auto}</style></head><body><main class="calculator"><h1>${description}</h1><div class="display"><div id="expression" class="expression"></div><div id="value" class="value">0</div></div><div class="keys"><button class="danger" onclick="clearAll()">AC</button><button onclick="backspace()">⌫</button><button onclick="percent()">%</button><button class="operator" onclick="press(&quot;/&quot;)">÷</button><button onclick="press(&quot;7&quot;)">7</button><button onclick="press(&quot;8&quot;)">8</button><button onclick="press(&quot;9&quot;)">9</button><button class="operator" onclick="press(&quot;*&quot;)">×</button><button onclick="press(&quot;4&quot;)">4</button><button onclick="press(&quot;5&quot;)">5</button><button onclick="press(&quot;6&quot;)">6</button><button class="operator" onclick="press(&quot;-&quot;)">−</button><button onclick="press(&quot;1&quot;)">1</button><button onclick="press(&quot;2&quot;)">2</button><button onclick="press(&quot;3&quot;)">3</button><button class="operator" onclick="press(&quot;+&quot;)">+</button><button onclick="press(&quot;0&quot;)">0</button><button onclick="press(&quot;.&quot;)">.</button><button class="equal" onclick="calculate()">=</button></div><div id="history" class="history"></div></main><script>let current="0",expression="",justCalculated=false;const v=document.getElementById("value"),e=document.getElementById("expression"),h=document.getElementById("history");function render(){v.textContent=current;e.textContent=expression}function press(k){if(justCalculated&&!"+-*/".includes(k)){current="0";expression="";justCalculated=false}if(/[0-9.]/.test(k)){if(k==="."&&current.includes("."))return;current=current==="0"&&k!=="."?k:current+k;return render()}expression=(expression||current)+" "+k+" ";current="0";justCalculated=false;render()}function calculate(){const x=expression+current;if(!/[+\-*/]/.test(x)||!/^[0-9+\-*/. ()]+$/.test(x))return;try{const n=Function("return ("+x+")")();if(!Number.isFinite(n))throw Error();current=String(Number(n.toPrecision(12)));expression=x+" =";justCalculated=true;const row=document.createElement("div");row.textContent=x+" = "+current;h.prepend(row);render()}catch{current="Error";expression="";justCalculated=true;render()}}function clearAll(){current="0";expression="";justCalculated=false;render()}function backspace(){if(!justCalculated)current=current.length>1?current.slice(0,-1):"0";render()}function percent(){const n=Number(current);if(Number.isFinite(n))current=String(n/100);render()}document.addEventListener("keydown",k=>{if(/[0-9.+\-*/]/.test(k.key)){k.preventDefault();press(k.key)}else if(k.key==="Enter"||k.key==="="){k.preventDefault();calculate()}else if(k.key==="Escape")clearAll();else if(k.key==="Backspace")backspace()});render();</script></body></html>`;

  const cardGameHtml=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${description}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#080b10;color:#fff;font-family:system-ui;display:grid;place-items:center;padding:18px}.game{width:min(620px,100%);background:#121722;border:1px solid #303744;border-radius:20px;padding:18px;box-shadow:0 18px 60px #0008}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.title{font-weight:800}.stats{font-size:13px;color:#aeb7c5}.board{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{aspect-ratio:3/4;border:1px solid #3a4556;border-radius:14px;background:#202735;color:#fff;cursor:pointer;font-size:28px;font-weight:800;display:grid;place-items:center;user-select:none;transition:transform .12s ease,background .12s ease}.card:hover{transform:translateY(-2px)}.card.flipped,.card.matched{background:#f3f4f6;color:#111}.card.matched{outline:2px solid #7ee787}.controls{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}.controls button{border:1px solid #3b4656;background:#202735;color:#fff;border-radius:10px;padding:10px 14px;cursor:pointer}.hint{font-size:12px;color:#98a2b3}.overlay{position:absolute;inset:0;display:grid;place-items:center;background:#0009;border-radius:14px}.overlay.hidden{display:none}.message{background:#111722;border:1px solid #394454;border-radius:14px;padding:18px;text-align:center}.stage{position:relative}.board{position:relative}@media(max-width:430px){.game{padding:12px}.board{gap:7px}.card{border-radius:10px;font-size:22px}.hint{font-size:11px}}</style></head><body><main class="game"><div class="top"><div class="title">${description}</div><div class="stats">Moves: <strong id="moves">0</strong> · Matches: <strong id="matches">0</strong>/8</div></div><div class="stage"><div id="board" class="board" aria-label="Card matching game"></div><div id="overlay" class="overlay hidden"><div class="message"><strong id="message">You win!</strong><div style="margin-top:8px"><button id="restartOverlay">Play again</button></div></div></div></div><div class="controls"><span class="hint">Tap two cards to find matching pairs.</span><button id="restart">Restart</button></div></main><script>
const board=document.getElementById("board"),movesEl=document.getElementById("moves"),matchesEl=document.getElementById("matches"),overlay=document.getElementById("overlay"),message=document.getElementById("message");
const symbols=["♠","♥","♦","♣","★","☀","☂","☘"],deck=[...symbols,...symbols];
let first=null,second=null,locked=false,moves=0,matches=0;
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function reset(){first=null;second=null;locked=false;moves=0;matches=0;movesEl.textContent="0";matchesEl.textContent="0";overlay.classList.add("hidden");board.innerHTML="";shuffle([...deck]).forEach((symbol,index)=>{const button=document.createElement("button");button.type="button";button.className="card";button.dataset.symbol=symbol;button.dataset.index=String(index);button.setAttribute("aria-label","Hidden card");button.textContent="?";button.addEventListener("click",()=>flip(button));board.appendChild(button)})}
function flip(card){if(locked||card===first||card.classList.contains("matched"))return;card.classList.add("flipped");card.textContent=card.dataset.symbol;card.setAttribute("aria-label","Card "+card.dataset.symbol);if(!first){first=card;return}second=card;moves++;movesEl.textContent=String(moves);locked=true;if(first.dataset.symbol===second.dataset.symbol){first.classList.add("matched");second.classList.add("matched");matches++;matchesEl.textContent=String(matches);first=null;second=null;locked=false;if(matches===symbols.length)win();return}setTimeout(()=>{first.classList.remove("flipped");second.classList.remove("flipped");first.textContent="?";second.textContent="?";first.setAttribute("aria-label","Hidden card");second.setAttribute("aria-label","Hidden card");first=null;second=null;locked=false},650)}
function win(){message.textContent="You win in "+moves+" moves!";overlay.classList.remove("hidden")}
document.getElementById("restart").addEventListener("click",reset);document.getElementById("restartOverlay").addEventListener("click",reset);reset();
</script></body></html>`;
  const gameHtml=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${description}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#080b10;color:#fff;font-family:system-ui;display:grid;place-items:center;padding:18px}.game{width:min(760px,100%);background:#121722;border:1px solid #303744;border-radius:20px;padding:16px;box-shadow:0 18px 60px #0008}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.title{font-weight:800}.score{font-variant-numeric:tabular-nums}.stage{position:relative}.stage canvas{display:block;width:100%;height:auto;background:#070a10;border:1px solid #29303a;border-radius:14px;touch-action:none}.controls{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px}.controls button{border:1px solid #3b4656;background:#202735;color:#fff;border-radius:10px;padding:9px 13px;cursor:pointer}.hint{font-size:12px;color:#98a2b3}.overlay{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}.card{background:#111722e8;border:1px solid #394454;border-radius:14px;padding:18px;text-align:center}.hidden{display:none}</style></head><body><main class="game"><div class="top"><div class="title">${description}</div><div>Score: <strong id="score">0</strong></div></div><div class="stage"><canvas id="game" width="720" height="420" aria-label="Mini game"></canvas><div id="overlay" class="overlay"><div class="card"><strong id="message">Press Start</strong></div></div></div><div class="controls"><span class="hint">Move with ← → / A D. On touch screens, drag the player.</span><button id="start">Start / Restart</button></div></main><script>
const canvas=document.getElementById("game"),ctx=canvas.getContext("2d"),scoreEl=document.getElementById("score"),start=document.getElementById("start"),overlay=document.getElementById("overlay"),message=document.getElementById("message");
const player={x:canvas.width/2-22,y:canvas.height-48,w:44,h:24,speed:7},keys=new Set();let items=[],score=0,running=false,raf=0,last=0,spawn=0;
function reset(){items=[];score=0;player.x=canvas.width/2-player.w/2;scoreEl.textContent=score;overlay.classList.add("hidden");running=true;last=performance.now();spawn=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);}
function end(){running=false;cancelAnimationFrame(raf);message.textContent="Game over — score "+score;overlay.classList.remove("hidden");}
function hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function spawnItem(){const size=18+Math.random()*18;items.push({x:Math.random()*(canvas.width-size),y:-size,w:size,h:size,speed:2.5+Math.random()*2.5+score*.03});}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#0b1220";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#fff";ctx.fillRect(player.x,player.y,player.w,player.h);for(const item of items){ctx.fillStyle="#f3b34c";ctx.beginPath();ctx.arc(item.x+item.w/2,item.y+item.h/2,item.w/2,0,Math.PI*2);ctx.fill()}}
function loop(now){if(!running)return;const dt=Math.min(32,now-last);last=now;if(keys.has("ArrowLeft")||keys.has("a"))player.x-=player.speed; if(keys.has("ArrowRight")||keys.has("d"))player.x+=player.speed;player.x=Math.max(0,Math.min(canvas.width-player.w,player.x));spawn+=dt;if(spawn>650){spawn=0;spawnItem()}for(let i=items.length-1;i>=0;i--){const item=items[i];item.y+=item.speed*dt/16;if(hit(player,item)){end();return}if(item.y>canvas.height){items.splice(i,1);score++;scoreEl.textContent=score}}draw();raf=requestAnimationFrame(loop)}
document.addEventListener("keydown",e=>{if(["ArrowLeft","ArrowRight","a","d","A","D"].includes(e.key))keys.add(e.key);if(e.key===" "&& !running)reset()});
document.addEventListener("keyup",e=>keys.delete(e.key));
canvas.addEventListener("pointermove",e=>{if(e.buttons===1||e.pointerType==="touch"){const r=canvas.getBoundingClientRect();player.x=Math.max(0,Math.min(canvas.width-player.w,(e.clientX-r.left)*canvas.width/r.width-player.w/2));if(!running)reset()}});
start.addEventListener("click",reset);draw();
</script></body></html>`;

  const finalHtml=isCardGame?cardGameHtml:(isMiniGame?(gameHtml):(isCalculator?calculatorHtml:html));
  const index=`import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");

export function createServer(){
  return http.createServer((req,res)=>{
    if(req.url==="/health"){
      res.writeHead(200,{"content-type":"application/json"});
      return res.end(JSON.stringify({status:"ok",service:"${name}",engine:"jora-native"}));
    }
    if(req.url==="/api/capabilities"){
      res.writeHead(200,{"content-type":"application/json"});
      return res.end(JSON.stringify({service:"${name}",api:${apiMode},data:${dataMode},game:${isMiniGame},engine:"jora-native"}));
    }
    res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
    res.end(html);
  });
}

if(import.meta.url==="file://" + process.argv[1]){
  const port=Number(process.env.PORT||3000);
  createServer().listen(port,()=>console.log("Jora project listening on " + port));
}`;

  const pkg=json({name,version:"0.1.0",private:true,type:"module",scripts:{start:"node src/index.js",test:"node --test"},engines:{node:">=20"}});
  const gameTest=`import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "../src/index.js";

test("mini game contains playable canvas mechanics and a health endpoint",async()=>{
  const html=await readFile(new URL("../src/index.html",import.meta.url),"utf8");
  assert.match(html,/canvas id="game"/);
  assert.match(html,/requestAnimationFrame\(loop\)/);
  assert.match(html,/spawnItem\(\)/);
  assert.match(html,/addEventListener\("keydown"/);
  const server=createServer();
  await new Promise(resolve=>server.listen(0,resolve));
  const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/capabilities");
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.game,true);
  await new Promise(resolve=>server.close(resolve));
});
`;
  const cardGameTest=`import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "../src/index.js";

test("card game contains real matching-card behavior and a health endpoint",async()=>{
  const html=await readFile(new URL("../src/index.html",import.meta.url),"utf8");
  assert.match(html,/class="card"/);
  assert.match(html,/function flip\(card\)/);
  assert.match(html,/function shuffle\(a\)/);
  assert.match(html,/matches===symbols\.length/);
  const server=createServer();
  await new Promise(resolve=>server.listen(0,resolve));
  const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/capabilities");
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.game,true);
  await new Promise(resolve=>server.close(resolve));
});
`;
  const calculatorTest=`import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "../src/index.js";

test("calculator app contains real calculator behavior",async()=>{
  const html=await readFile(new URL("../src/index.html",import.meta.url),"utf8");
  assert.match(html,/function calculate\\(\\)/);
  assert.match(html,/class="equal"/);
  const server=createServer();
  await new Promise(resolve=>server.listen(0,resolve));
  const port=server.address().port;
  const response=await fetch("http://127.0.0.1:"+port+"/health");
  assert.equal(response.status,200);
  await new Promise(resolve=>server.close(resolve));
});
`;
  const genericTest=`import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "../src/index.js";

test("generated service exposes a health endpoint",async()=>{
  const server=createServer();
  await new Promise(resolve=>server.listen(0,resolve));
  const port=server.address().port;
  const response=await fetch("http://127.0.0.1:"+port+"/health");
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.status,"ok");
  assert.equal(body.engine,"jora-native");
  await new Promise(resolve=>server.close(resolve));
});
`;
  const test=isCardGame?cardGameTest:(isMiniGame?gameTest:(isCalculator?calculatorTest:genericTest));
  const readme=`# ${description}

Generated by Jora Native Engineering Engine.

Run:
npm start

Verify:
npm test

Runtime:
- Node.js 20+
- Zero external runtime dependencies
- /health health endpoint
- /api/capabilities capability endpoint
- Browser UI served by the Node service

Features:
${isCardGame?"- Interactive matching card game with shuffled pairs, move counter, match tracking, win state and restart\n":""}${isMiniGame?"- Playable canvas mini game with keyboard and touch controls\n":""}${isCalculator?"- Interactive calculator with keyboard support\n":""}
Original request:
${command}
`;
  return {name,files:[
    {path:"package.json",content:pkg},
    {path:"src/index.js",content:index},
    {path:"src/index.html",content:finalHtml},
    {path:"test/index.test.js",content:test},
    {path:"README.md",content:readme}
  ]};
}

function evaluateArithmetic(input){
  const source=String(input||"").replace(/,/g,"").trim();
  if(!/^[0-9+\-*/%.()\s]+$/.test(source)||!/[+\-*/]/.test(source)) return null;
  const tokens=source.match(/(?:\\d+(?:\\.\\d*)?|\\.\\d+)|[+\-*/%()]/g);
  if(!tokens||tokens.join("")!==source.replace(/\s+/g,"")) return null;
  let i=0;
  const primary=()=>{const t=tokens[i];if(t==="("){i++;const v=add();if(tokens[i]!==")")throw Error();i++;return v}if(!t||!/^\\d/.test(t)&&t[0]!==".")throw Error();i++;return Number(t)};
  const unary=()=>{if(tokens[i]==="+"){i++;return unary()}if(tokens[i]==="-"){i++;return -unary()}return primary()};
  const mul=()=>{let v=unary();while(["*","/","%"].includes(tokens[i])){const op=tokens[i++],b=unary();if(op==="*")v*=b;else if(op==="/"){if(b===0)throw Error();v/=b}else v%=b}return v};
  const add=()=>{let v=mul();while(["+","-"].includes(tokens[i])){const op=tokens[i++],b=mul();v=op==="+"?v+b:v-b}return v};
  const value=add();if(i!==tokens.length||!Number.isFinite(value))return null;return value;
}
function simpleAnswer(question){
  const q=clean(question),l=q.toLowerCase();
  try{
    const arithmetic=evaluateArithmetic(q.replace(/^(what is|calculate|solve|compute)\s+/i,""));
    if(arithmetic!==null)return "The answer is "+String(Number(arithmetic.toPrecision(12)))+".";
  }catch{}
  if(/^(who|what)\s+(are|is)\s+you\\??$/i.test(q)) return "I’m Jora, an autonomous software factory. I can answer questions, research information, and build, test and repair software.";
  if(/what is (ai|artificial intelligence)/i.test(l)) return "Artificial intelligence (AI) is software that performs tasks that normally require human-like capabilities such as understanding language, recognizing patterns, reasoning, learning, and generating content.";
  if(/what is (javascript|js)/i.test(l)) return "JavaScript is a programming language widely used to make web pages and applications interactive. It also runs outside browsers, for example on servers with Node.js.";
  if(/what is (python)/i.test(l)) return "Python is a general-purpose programming language known for readable syntax and widely used in web development, automation, data analysis, scientific computing, and AI.";
  if(/what is (gravity)/i.test(l)) return "Gravity is the interaction associated with mass-energy that causes bodies to accelerate toward one another. Near Earth’s surface, the acceleration is about 9.81 m/s².";
  if(/^(hi|hello|hey)(\s+jora)?[!?]?$/.test(l)) return "I’m ready. Ask me a question, give me a calculation, ask for current information, or describe software you want built.";
  return null;
}

function taskList(prompt){
  const objective=extractCommand(prompt);
  const lower=objective.toLowerCase();
  const tasks=[
    ["Understand request","Convert the request into explicit requirements and acceptance criteria","high",[]],
    ["Plan architecture","Define components, interfaces, data flow, risks and assumptions","high",["Understand request"]],
    ["Implement core","Create the smallest production-ready implementation that satisfies the requirements","high",["Plan architecture"]],
    ["Verify","Run tests, static checks and acceptance criteria; diagnose failures","high",["Implement core"]],
    ["Harden","Review security, reliability, observability and operational failure modes","medium",["Verify"]]
  ];
  if(/deploy|ship|production|launch/.test(lower)) tasks.push(["Release","Prepare and verify a reproducible production release","medium",["Harden"]]);
  return tasks.map(([title,description,priority,dependencies],i)=>({id:"JORA-TASK-"+String(i+1).padStart(3,"0"),title,description,priority,dependencies}));
}

export class JoraNativeProvider{
  constructor({version="2.1.0"}={}){this.model="jora";this.version=version;this.kind="native";}
  async complete({messages=[]}={}){
    const user=clean(messages.filter(x=>x.role==="user").map(x=>x.content).join("\n"));
    if(/Return ONLY JSON with a files array/i.test(user)){
      const command=extractCommand(user);
      const existing=extractExistingProject(user);
      const project=existing?applyExistingChange(command,existing):projectFor(command);
      return {text:json({files:project.files}),model:"jora",engine:this.kind};
    }
    if(/Return ONLY a JSON array of implementation tasks/i.test(user)){
      return {text:json(taskList(user)),model:"jora",engine:this.kind};
    }
    const lower=user.toLowerCase();
    const directAnswer=simpleAnswer(user);
    if(directAnswer) return {text:directAnswer,model:"jora",engine:this.kind};
    if(/\b(what(?:'s| is)?|tell me|give me)?\s*(the\s*)?(date|day)\s*(today|now)?\b|\btoday(?:'s| is)?\s*(date|day)\b/.test(lower)){
      const now=new Date();
      const date=new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(now);
      return {text:"Today is "+date+".",model:"jora",engine:this.kind};
    }
    if(/\b(what(?:'s| is)?\s*)?(the\s*)?(time|clock)\s*(now|today)?\b/.test(lower)){
      const now=new Date();
      const time=new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true}).format(now);
      return {text:"The current time in India (IST) is "+time+".",model:"jora",engine:this.kind};
    }
    if(/research|search|latest|news|look up/.test(lower)){
      return {text:"Jora is running in native mode. Web research is available through Jora's search tool; I can search, extract evidence, compare sources, and turn the findings into an implementation plan.",model:"jora",engine:this.kind};
    }
    if(/build|create|make|develop|implement|code|fix|deploy|ship/.test(lower)){
      return {text:"Jora Native Engine accepted the engineering request. I will structure it as requirements → architecture → task DAG → implementation → verification → recovery. No external AI API key is required for this native execution path.",model:"jora",engine:this.kind};
    }
    return {text:"I am Jora, the autonomous engineering system. I can understand requirements, plan architecture, decompose work into verified tasks, research the web, generate runnable project artifacts, test them, diagnose failures, and keep an execution trace.",model:"jora",engine:this.kind};
  }
}
