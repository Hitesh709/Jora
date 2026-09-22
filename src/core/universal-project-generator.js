import {compilePlanToCode} from "./code-generation-engine.js";
function clean(value=""){return String(value??"").replace(/\s+/g," ").trim();}
function slug(value="jora-project"){return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"jora-project";}

function normalizeGameIntent(command){
  const original=clean(command);
  let normalized=original;
  const corrections=[];
  const gameVocabulary=["snake","pong","tetris","racing","racer","platformer","shooter","runner","dodge","chess","puzzle","arcade"];
  const words=normalized.toLowerCase().split(/\\s+/);
  const hasGame=words.includes("game")||words.includes("games");
  if(hasGame){
    for(const word of words){
      const token=word.replace(/[^a-z0-9-]/g,"");
      if(token.length<4) continue;
      let best=null,bestDistance=3;
      for(const candidate of gameVocabulary){
        if(Math.abs(token.length-candidate.length)>2) continue;
        const matrix=Array.from({length:token.length+1},()=>Array(candidate.length+1).fill(0));
        for(let i=0;i<=token.length;i++) matrix[i][0]=i;
        for(let j=0;j<=candidate.length;j++) matrix[0][j]=j;
        for(let i=1;i<=token.length;i++) for(let j=1;j<=candidate.length;j++)
          matrix[i][j]=Math.min(matrix[i-1][j]+1,matrix[i][j-1]+1,matrix[i-1][j-1]+(token[i-1]===candidate[j-1]?0:1));
        const distance=matrix[token.length][candidate.length];
        if(distance<bestDistance){bestDistance=distance;best=candidate;}
      }
      if(best && best!==token && bestDistance<=2){
        normalized=normalized.replace(new RegExp("\\b"+token+"\\b","ig"),best);
        corrections.push({from:token,to:best,distance:bestDistance,reason:"near-match game vocabulary"});
        break;
      }
    }
  }
  return {original,normalized,corrections};
}

function titleOf(command){
  return clean(command).replace(/^(build|create|make|develop|design|generate|implement)\s+/i,"").slice(0,100)||"Jora Application";
}

function inferRequirements(command){
  const normalized=normalizeGameIntent(command);
  const text=clean(normalized.normalized), lower=text.toLowerCase();
  const has=(re)=>re.test(lower);
  const pick=(patterns)=>patterns.filter(([re])=>has(re)).map(([,value])=>value);
  const r={userFlows:[],ui:[],data:[],api:[],auth:[],integrations:[],platform:[],constraints:[],acceptanceCriteria:[]};
  if(has(/\b(login|sign[ -]?in|authentication|auth)\b/))r.auth.push("Users can sign in");
  if(has(/\b(sign[ -]?up|signup|register|registration)\b/))r.auth.push("Users can register");
  if(has(/\b(admin|administrator|admin panel|admin dashboard)\b/))r.auth.push("Admin access is required");
  if(has(/\b(role|roles|permissions|permission)\b/))r.auth.push("Role-based permissions are required");
  r.platform.push(...pick([[/\bmobile\b/,"mobile"],[/\bandroid\b/,"android"],[/\bios\b/,"ios"],[/\bweb|website|browser\b/,"web"]]));
  if(!r.platform.length)r.platform.push("web");
  r.ui.push(...pick([[/\bdashboard|admin dashboard\b/,"dashboard"],[/\bform|forms\b/,"forms"],[/\btable|tables|list\b/,"list/table"],[/\bsearch|filter|find|lookup\b/,"search/filter"],[/\bcheckout|cart\b/,"checkout"],[/\bchat|messag|conversation\b/,"messaging UI"],[/\bgame|arcade|racing|platformer|shooter|pong|snake|tetris\b/,"interactive game UI"]]));
  r.data.push(...pick([[/\bdatabase|db|persistent|persistence|save|store data\b/,"persistent data"],[/\buser|customer|client\b/,"user/customer records"],[/\bproduct|catalog|inventory\b/,"product/inventory records"],[/\bbooking|reservation|appointment\b/,"booking records"],[/\border|checkout|cart|payment\b/,"order/payment records"],[/\btask|todo|project\b/,"task/project records"],[/\binvoice|expense|loan|finance\b/,"financial records"]]));
  r.api.push(...pick([[/\bapi\b/,"API endpoints"],[/\brest\b/,"REST API"],[/\bgraphql\b/,"GraphQL API"],[/\bwebhook\b/,"webhooks"],[/\bendpoint|endpoints\b/,"HTTP endpoints"]]));
  r.integrations.push(...pick([[/\bstripe\b/,"Stripe"],[/\bpaypal\b/,"PayPal"],[/\brazorpay\b/,"Razorpay"],[/\bgoogle\b/,"Google integration"],[/\bgithub\b/,"GitHub integration"],[/\bslack\b/,"Slack integration"],[/\bemail|mailgun|sendgrid\b/,"email delivery"]]));
  r.userFlows.push(...pick([[/\b(sign[ -]?up|signup|register)\b/,"register"],[/\b(login|sign[ -]?in)\b/,"sign in"],[/\b(create|add)\b/,"create"],[/\b(edit|update|modify)\b/,"edit/update"],[/\b(delete|remove)\b/,"delete"],[/\b(search|filter|find|lookup)\b/,"search/filter"],[/\bcheckout|purchase|buy|order\b/,"checkout/purchase"],[/\bbook|booking|reserve|reservation\b/,"book/reserve"]]));
  r.constraints.push(...pick([[/\bmobile\b/,"mobile-friendly"],[/\bresponsive\b/,"responsive UI"],[/\brealtime|real-time\b/,"real-time behavior"],[/\boffline\b/,"offline support"],[/\bfast|performance\b/,"performance-sensitive"],[/\bsecure|security\b/,"security-sensitive"]]));
  r.acceptanceCriteria.push("Matches the requested product type and named features","Generated project is runnable and exposes a health endpoint");
  if(r.api.length)r.acceptanceCriteria.push("Requested API surface is represented");
  if(r.auth.length)r.acceptanceCriteria.push("Requested authentication requirements are represented");
  if(r.integrations.length)r.acceptanceCriteria.push("Requested integrations are identified");
  for(const key of Object.keys(r))r[key]=[...new Set(r[key])];
  return r;
}

function inferBlueprint(command){
  const normalized=normalizeGameIntent(command);
  const text=clean(normalized.normalized), lower=text.toLowerCase();
  const requirements=inferRequirements(text);
  const game=/\b(game|arcade|racing|racer|platformer|shooter|pong|snake|snack|snak|tetris|chess|card game|memory game|puzzle game)\b/.test(lower);
  const rawGameType=/\b(card game|memory game|chess|snake|snack|snak|tetris|pong|racing|racer|platformer|shooter|shooting game|space shooter|runner|dodge|puzzle game)\b/.exec(lower)?.[1]?.replace(/\s+/g,"-")||"arcade";
  const gameAliases={snack:"snake",snak:"snake",snakes:"snake",racer:"racing","shooting-game":"shooter","space-shooter":"shooter"};
  const gameType=gameAliases[rawGameType]||rawGameType;
  const api=/\b(api|backend|server|service|rest|graphql|webhook|endpoint)\b/.test(lower);
  const data=/\b(crud|database|data|admin|dashboard|crm|inventory|loan|customer|employee|booking|reservation|order|product|user|task|todo|project|invoice|expense|finance|school|hospital)\b/.test(lower);
  const chat=/\b(chat|messag|conversation|support desk|inbox)\b/.test(lower);
  const commerce=/\b(shop|store|ecommerce|e-commerce|cart|checkout|product catalog|marketplace)\b/.test(lower);
  const auth=/\b(login|sign[ -]?in|signup|sign[ -]?up|register|authentication|auth|account)\b/.test(lower);
  const search=/\b(search|filter|find|lookup)\b/.test(lower);
  const mobile=/\bmobile|android|ios\b/.test(lower);
  const entities=[];
  const add=(name,label)=>{if(!entities.some(x=>x.name===name))entities.push({name,label});};
  if(/\b(product|products|shop|store|ecommerce|catalog)\b/.test(lower))add("products","Products");
  if(/\b(customer|customers|client|clients|crm)\b/.test(lower))add("customers","Customers");
  if(/\b(user|users|account|accounts)\b/.test(lower))add("users","Users");
  if(/\b(booking|bookings|reservation|reservations|appointment|appointments)\b/.test(lower))add("bookings","Bookings");
  if(/\b(order|orders|checkout|cart)\b/.test(lower))add("orders","Orders");
  if(/\b(task|tasks|todo|todos|project|projects)\b/.test(lower))add("tasks","Tasks");
  if(/\b(invoice|invoices|expense|expenses|loan|loans|payment|payments|finance)\b/.test(lower))add("records","Records");
  if(!game&&!api&&!entities.length&&data)add("records","Records");
  if(!entities.length)add("items","Items");
  return {
    name:slug(titleOf(text)),title:titleOf(text),description:text.slice(0,240),
    kind:game?"game":(api && !/\b(app|application|platform|website|web app|dashboard|system|store|site)\b/.test(lower))?"api":"web",
    features:{game,api,data:data||entities.length>0,chat,commerce,auth,search,mobile},
    gameType,
    entities,
    requirements,
    projectBlueprint:{
      version:"1.0",
      product:{name:slug(titleOf(text)),title:titleOf(text),kind:game?"game":(api && !/\b(app|application|platform|website|web app|dashboard|system|store|site)\b/.test(lower))?"api":"web",description:text.slice(0,240)},
      roles:[...(requirements.auth.some(x=>x.includes("Admin"))?["admin"]:[]),...(requirements.auth.some(x=>x.includes("sign in"))?["user"]:[])],
      flows:requirements.userFlows,
      features:[...new Set([...Object.entries({chat,commerce,search}).filter(([,v])=>v).map(([k])=>k),...requirements.ui])],
      screens:requirements.ui.length?requirements.ui:game?["game"]:["main"],
      entities,
      api:requirements.api,
      authentication:requirements.auth,
      integrations:requirements.integrations,
      platform:requirements.platform,
      constraints:requirements.constraints,
      acceptanceCriteria:requirements.acceptanceCriteria
    },
    plan:buildPlan({version:"1.0",product:{name:slug(titleOf(text)),title:titleOf(text),kind:game?"game":api?"api":"web",description:text.slice(0,240)},roles:[...(requirements.auth.some(x=>x.includes("Admin"))?["admin"]:[]),...(requirements.auth.some(x=>x.includes("sign in"))?["user"]:[])],flows:requirements.userFlows,features:[...new Set([...Object.entries({chat,commerce,search}).filter(([,v])=>v).map(([k])=>k),...requirements.ui])],screens:requirements.ui.length?requirements.ui:game?["game"]:["main"],entities,api:requirements.api,authentication:requirements.auth,integrations:requirements.integrations,platform:requirements.platform,constraints:requirements.constraints,acceptanceCriteria:requirements.acceptanceCriteria}),
    corrections:normalized.corrections,
    originalRequest:normalized.original,
    assumptions:["Dependency-light by default","Runnable local project with health and capability endpoints","Local persistence unless a server database is explicitly required"]
  };
}

function buildPlan(projectBlueprint){
  const b=projectBlueprint;
  const steps=[];
  const add=(id,title,description,dependsOn=[],type="implementation")=>steps.push({id,title,description,dependsOn,type,inputs:[],outputs:[],acceptanceCriteria:[]});
  add("01-analyze","Validate requirements","Confirm the request, blueprint, scope, platform, roles, flows, and acceptance criteria.",[],"analysis");
  if(b.roles?.length) add("02-auth","Set up access model","Implement the requested user/admin roles and authentication boundaries.",["01-analyze"],"foundation");
  if(b.entities?.length) add("03-data","Define data model","Create the requested entities, fields, relationships, and persistence strategy.",["01-analyze"],"foundation");
  add("04-shell","Build application shell","Create the navigation, responsive layout, entry screen, and shared UI structure.",["01-analyze"],"ui");
  if(b.screens?.length) add("05-screens","Build requested screens","Implement the screens implied by the blueprint and connect them to the application shell.",["04-shell"],"ui");
  if(b.flows?.length) add("06-flows","Implement user flows","Wire the requested user journeys and state transitions end-to-end.",["05-screens",...(b.entities?.length?["03-data"]:[])],"implementation");
  if(b.api?.length) add("07-api","Implement API surface","Implement the requested API style and endpoints, including validation and error handling.",["03-data","06-flows"],"backend");
  if(b.integrations?.length) add("08-integrations","Connect integrations","Add adapters/configuration for requested external integrations without hard-coding secrets.",["07-api"],"integration");
  if(b.kind==="game"||b.product?.kind==="game") add("09-gameplay","Implement game mechanics","Implement the requested game type, controls, scoring/state, and restart behavior.",["04-shell"],"gameplay");
  add("10-verify","Run acceptance tests","Verify the generated product against the blueprint, health endpoint, and requested acceptance criteria.",[...steps.slice(1).map(s=>s.id)],"verification");
  add("11-repair","Repair failures","Analyze failed checks, make the smallest targeted fixes, and rerun affected tests.",["10-verify"],"repair");
  add("12-preview","Prepare preview","Produce a runnable preview only after verification and repair pass.",["11-repair"],"delivery");
  for(const step of steps){
    step.inputs=[b.product?.title||"product blueprint"];
    step.outputs=[step.id==="10-verify"?"verification report":step.id==="12-preview"?"preview artifact":"implementation changes"];
    step.acceptanceCriteria=[...(b.acceptanceCriteria||[])];
  }
  return {version:"1.0",strategy:"dependency-aware",steps,entryStep:"01-analyze",finalStep:"12-preview"};
}

function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]||ch));}
function shellStyle(){return "*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#0b1020;color:#edf2f7;min-height:100vh}button,input{font:inherit}.app{width:min(1180px,100%);margin:auto;padding:24px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px}.brand{font-size:22px;font-weight:800}.muted{color:#9aa8bc}.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:16px}.panel{background:#121a2a;border:1px solid #27344a;border-radius:18px;padding:18px}.panel h2{margin:0 0 12px}.actions{display:flex;flex-wrap:wrap;gap:8px}.button{border:1px solid #35445d;background:#1c2940;color:#fff;border-radius:10px;padding:9px 13px;cursor:pointer}.button.primary{background:#f5f7fa;color:#111827}.button.danger{background:#3a1f28}.form{display:grid;gap:9px;margin:12px 0}.form input{width:100%;background:#0c1424;color:#fff;border:1px solid #33435c;border-radius:10px;padding:10px}.cards{display:grid;gap:9px}.item{border:1px solid #2b3950;border-radius:12px;padding:12px;background:#0f1728}.item strong{display:block;margin-bottom:4px}.badge{display:inline-block;font-size:11px;padding:3px 7px;border-radius:999px;background:#23314a;color:#b9c7dc}.empty{padding:18px;border:1px dashed #35445d;border-radius:12px;color:#9aa8bc}.stat{font-size:30px;font-weight:800}.gameWrap{display:grid;place-items:center}.gameWrap canvas{width:min(900px,100%);height:auto;background:#070b14;border:1px solid #2b3950;border-radius:16px;touch-action:none}.notice{margin-top:10px;color:#9aa8bc;font-size:13px}@media(max-width:780px){.app{padding:14px}.grid{grid-template-columns:1fr}}";}

function appHtml(bp){
  const b=JSON.stringify(bp).replace(/</g,"\\u003c");
  const entity=bp.entities[0], label=entity.label;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(bp.title)}</title><style>${shellStyle()}</style></head><body><main class="app">
<header class="top"><div><div class="brand">${escapeHtml(bp.title)}</div><div class="muted">${escapeHtml(bp.description)}</div></div><span class="badge">Jora Universal Builder</span></header>
<div class="grid"><section class="panel"><h2>${label}</h2><div class="form"><input id="name" placeholder="${entity.name} name"><input id="detail" placeholder="Status or detail"><div class="actions"><button class="button primary" id="add">Add</button><button class="button" id="clear">Clear all</button></div></div><div id="list" class="cards"></div></section>
<section class="panel"><h2>Product status</h2><div class="stat" id="count">0</div><div class="muted">records in this running project</div><hr style="border-color:#27344a;margin:18px 0"><p id="capabilities" class="muted"></p><div class="actions"><button class="button" id="health">Check health</button><button class="button" id="seed">Seed demo data</button></div><p id="status" class="notice">Ready</p></section></div>
<section class="panel" style="margin-top:16px"><h2>Requested capabilities</h2><div class="actions">${bp.features.auth?'<span class="badge">Authentication</span>':""}${bp.features.search?'<span class="badge">Search</span>':""}${bp.features.chat?'<span class="badge">Messaging</span>':""}${bp.features.commerce?'<span class="badge">Commerce</span>':""}${bp.features.data?'<span class="badge">Data management</span>':""}${bp.features.mobile?'<span class="badge">Mobile responsive</span>':""}${bp.kind==="api"?'<span class="badge">API service</span>':""}<span class="badge">Local persistence</span></div></section>
</main><script>
const blueprint=${b};
const key="jora-universal:"+blueprint.name;
let records=JSON.parse(localStorage.getItem(key)||"[]");
const list=document.getElementById("list"),count=document.getElementById("count"),status=document.getElementById("status");
function save(){localStorage.setItem(key,JSON.stringify(records))}
function render(){count.textContent=String(records.length);list.innerHTML="";if(!records.length){list.innerHTML='<div class="empty">No records yet. Add one above.</div>';return}records.forEach((r,i)=>{const el=document.createElement("article");el.className="item";el.innerHTML="<strong></strong><span class=\\"muted\\"></span><div class=\\"actions\\" style=\\"margin-top:8px\\"><button class=\\"button danger\\">Delete</button></div>";el.querySelector("strong").textContent=r.name;el.querySelector("span").textContent=r.detail||"No detail";el.querySelector("button").onclick=()=>{records.splice(i,1);save();render()};list.appendChild(el)})}
document.getElementById("add").onclick=()=>{const name=document.getElementById("name").value.trim();if(!name){status.textContent="Enter a name first.";return}records.push({name,detail:document.getElementById("detail").value.trim(),createdAt:new Date().toISOString()});save();document.getElementById("name").value="";document.getElementById("detail").value="";status.textContent="Saved.";render()};
document.getElementById("clear").onclick=()=>{records=[];save();render();status.textContent="Cleared."};
document.getElementById("seed").onclick=()=>{records=[{name:"Demo ${label.slice(0,-1)||label}",detail:"Generated by Jora",createdAt:new Date().toISOString()},{name:"Sample",detail:"Ready for modification",createdAt:new Date().toISOString()}];save();render();status.textContent="Demo data loaded."};
document.getElementById("health").onclick=async()=>{try{const r=await fetch("/health");const d=await r.json();status.textContent=d.status==="ok"?"Healthy · "+new Date().toLocaleTimeString():"Health check failed"}catch{status.textContent="Running in preview mode"}};
document.getElementById("capabilities").textContent=blueprint.kind==="api"?"Universal API service surface with a browser control panel.":"Universal application shell generated from the natural-language request.";
render();
</script></body></html>`;
  return b;
}

function gameHtml(bp){
  const title=escapeHtml(bp.title);
  const css="*{box-sizing:border-box}body{margin:0;background:#080b12;color:#fff;font-family:system-ui;min-height:100vh;display:grid;place-items:center;padding:16px}.game{width:min(860px,100%);background:#121722;border:1px solid #303846;border-radius:18px;padding:16px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.board{position:relative}.board canvas{display:block;width:100%;height:auto;background:#060912;border-radius:12px;border:1px solid #2b3442;touch-action:none}.controls{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:10px}.btn{background:#202a3a;color:#fff;border:1px solid #3b4658;border-radius:9px;padding:9px 13px;cursor:pointer}.muted{color:#9ca8bb;font-size:12px}";
  const shell=(script,hint)=>`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head><body><main class="game"><div class="top"><strong>${title}</strong><span id="score">Score: 0</span></div><div class="board"><canvas id="game" width="800" height="500" aria-label="${bp.gameType} game"></canvas></div><div class="controls"><span class="muted">${hint}</span><button class="btn" id="start">Start / Restart</button></div></main><script>${script}</script></body></html>`;
  if(bp.gameType==="snake") return shell(`const c=document.getElementById("game"),x=c.getContext("2d"),s=document.getElementById("score");let snake=[{x:10,y:6}],food={x:15,y:6},dir={x:1,y:0},next={x:1,y:0},timer=0,running=false;function reset(){snake=[{x:10,y:6}];food={x:15,y:6};dir=next={x:1,y:0};running=true;timer=0;tick()}function tick(){if(!running)return;dir=next;const h={x:snake[0].x+dir.x,y:snake[0].y+dir.y};if(h.x<0||h.x>=20||h.y<0||h.y>=12||snake.some((p,i)=>i&&p.x===h.x&&p.y===h.y)){running=false;return}snake.unshift(h);if(h.x===food.x&&h.y===food.y){food={x:Math.floor(Math.random()*20),y:Math.floor(Math.random()*12)}}else snake.pop();s.textContent="Score: "+(snake.length-1);draw();timer=setTimeout(tick,110)}function draw(){x.fillStyle="#070b12";x.fillRect(0,0,800,500);x.fillStyle="#55d68a";snake.forEach(p=>x.fillRect(p.x*40+1,p.y*40+1,38,38));x.fillStyle="#f05b68";x.fillRect(food.x*40+6,food.y*40+6,28,28)}document.addEventListener("keydown",e=>{if(e.key==="ArrowUp"&&dir.y!==1)next={x:0,y:-1};if(e.key==="ArrowDown"&&dir.y!==-1)next={x:0,y:1};if(e.key==="ArrowLeft"&&dir.x!==1)next={x:-1,y:0};if(e.key==="ArrowRight"&&dir.x!==-1)next={x:1,y:0}});document.getElementById("start").onclick=reset;draw();`, "Snake: eat food, grow, and avoid walls and yourself.");
  if(bp.gameType==="pong") return shell(`const c=document.getElementById("game"),x=c.getContext("2d"),s=document.getElementById("score");let p=210,b={x:400,y:250,vx:5,vy:3},running=false,raf=0;function reset(){p=210;b={x:400,y:250,vx:5,vy:3};running=true;raf=requestAnimationFrame(loop)}function loop(){if(!running)return;x.fillStyle="#070b12";x.fillRect(0,0,800,500);x.fillStyle="#fff";x.fillRect(18,p,14,80);x.fillRect(768,b.y-40,14,80);x.beginPath();x.arc(b.x,b.y,9,0,7);x.fill();b.x+=b.vx;b.y+=b.vy;if(b.y<9||b.y>491)b.vy*=-1;if(b.x<32&&b.y>p&&b.y<p+80)b.vx=Math.abs(b.vx);if(b.x>760)b.vx=-Math.abs(b.vx);if(b.x<0){running=false}if(b.x>800){s.textContent="Score: "+(Number(s.textContent.split(": ")[1]||0)+1);reset();return}raf=requestAnimationFrame(loop)}document.addEventListener("keydown",e=>{if(e.key==="ArrowUp")p=Math.max(0,p-24);if(e.key==="ArrowDown")p=Math.min(420,p+24)});document.getElementById("start").onclick=reset;`, "Pong: move your paddle with ↑ and ↓.");
  if(bp.gameType==="racing"||bp.gameType==="racer") return shell(`const c=document.getElementById("game"),x=c.getContext("2d"),s=document.getElementById("score"),keys=new Set();let car=375,d=0,raf=0,running=false;function reset(){car=375;d=0;running=true;raf=requestAnimationFrame(loop)}function loop(){if(!running)return;d++;if(keys.has("ArrowLeft"))car-=6;if(keys.has("ArrowRight"))car+=6;car=Math.max(190,Math.min(560,car));x.fillStyle="#142018";x.fillRect(0,0,800,500);x.fillStyle="#30343b";x.fillRect(180,0,440,500);x.strokeStyle="#ddd";x.setLineDash([28,24]);x.lineWidth=5;x.beginPath();x.moveTo(400,0);x.lineTo(400,500);x.stroke();x.setLineDash([]);x.fillStyle="#2f80ed";x.fillRect(car,420,50,70);x.fillStyle="#e74c3c";x.fillRect(400+Math.sin(d/25)*130,80+(d%280),45,65);s.textContent="Distance: "+d;raf=requestAnimationFrame(loop)}document.addEventListener("keydown",e=>keys.add(e.key));document.addEventListener("keyup",e=>keys.delete(e.key));document.getElementById("start").onclick=reset;`, "Racing: steer with ← → and avoid the opponent.");
  if(["shooter","shooting-game","space-shooter"].includes(bp.gameType)) return shell(`const c=document.getElementById("game"),x=c.getContext("2d"),s=document.getElementById("score"),keys=new Set();let px=380,shots=[],enemies=[],score=0,raf=0,running=false;function reset(){px=380;shots=[];enemies=[];score=0;running=true;loop()}function loop(){if(!running)return;x.fillStyle="#050817";x.fillRect(0,0,800,500);if(keys.has("ArrowLeft"))px-=6;if(keys.has("ArrowRight"))px+=6;px=Math.max(10,Math.min(750,px));if(Math.random()<.025)enemies.push({x:10+Math.random()*740,y:0});shots.forEach(a=>a.y-=9);enemies.forEach(a=>a.y+=3);for(let i=enemies.length-1;i>=0;i--)for(let j=shots.length-1;j>=0;j--)if(Math.abs(enemies[i].x-shots[j].x)<24&&Math.abs(enemies[i].y-shots[j].y)<25){enemies.splice(i,1);shots.splice(j,1);score++;break}x.fillStyle="#4dd0e1";x.fillRect(px,455,40,25);x.fillStyle="#ffcc66";shots.forEach(a=>x.fillRect(a.x,a.y,4,12));x.fillStyle="#ef476f";enemies.forEach(a=>x.fillRect(a.x,a.y,28,28));s.textContent="Score: "+score;raf=requestAnimationFrame(loop)}document.addEventListener("keydown",e=>{keys.add(e.key);if(e.code==="Space"&&running)shots.push({x:px+18,y:450})});document.addEventListener("keyup",e=>keys.delete(e.key));document.getElementById("start").onclick=reset;`, "Shooter: move with ← → and fire with Space.");
  if(bp.gameType==="platformer") return shell(`const c=document.getElementById("game"),x=c.getContext("2d"),s=document.getElementById("score"),keys=new Set();let px=50,py=390,vy=0,raf=0,running=false;function reset(){px=50;py=390;vy=0;running=true;loop()}function loop(){if(!running)return;if(keys.has("ArrowLeft"))px-=4;if(keys.has("ArrowRight"))px+=4;if(keys.has("ArrowUp")&&py>=390)vy=-12;vy+=.5;py+=vy;if(py>390){py=390;vy=0}px=Math.max(0,Math.min(770,px));x.fillStyle="#111827";x.fillRect(0,0,800,500);x.fillStyle="#8b5cf6";x.fillRect(0,420,800,80);x.fillRect(250,340,140,18);x.fillRect(520,280,130,18);x.fillStyle="#6ee7b7";x.fillRect(px,py,30,30);s.textContent="Position: "+Math.floor(px);raf=requestAnimationFrame(loop)}document.addEventListener("keydown",e=>keys.add(e.key));document.addEventListener("keyup",e=>keys.delete(e.key));document.getElementById("start").onclick=reset;`, "Platformer: ← → move and ↑ jumps.");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${shellStyle()}</style></head><body><main class="app"><header class="top"><div><div class="brand">${title}</div><div class="muted">${escapeHtml(bp.description)}</div></div><span class="badge">Jora Universal Game Builder</span></header><section class="panel gameWrap"><canvas id="game" width="900" height="520" aria-label="Playable game"></canvas><div class="actions" style="margin-top:12px"><button class="button primary" id="start">Start / Restart</button><span class="badge">Score: <strong id="score">0</strong></span></div><div id="status" class="notice">Move with ← → / A-D. Touch: drag. Press Start to play.</div></section></main><script>const canvas=document.getElementById("game"),ctx=canvas.getContext("2d"),scoreEl=document.getElementById("score"),status=document.getElementById("status");const player={x:428,y:455,w:44,h:26,speed:7};let targets=[],keys=new Set(),score=0,running=false,raf=0,last=0,spawn=0;function hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}function reset(){targets=[];score=0;scoreEl.textContent="0";player.x=428;running=true;last=performance.now();spawn=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(loop)}function end(){running=false;cancelAnimationFrame(raf);status.textContent="Game over · score "+score}function spawnTarget(){const s=20+Math.random()*22;targets.push({x:Math.random()*(canvas.width-s),y:-s,w:s,h:s,speed:2.4+Math.random()*2.5})}function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#070b14";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#fff";ctx.fillRect(player.x,player.y,player.w,player.h);for(const t of targets){ctx.fillStyle="#f5b642";ctx.beginPath();ctx.arc(t.x+t.w/2,t.y+t.h/2,t.w/2,0,Math.PI*2);ctx.fill()}}function loop(now){if(!running)return;const dt=Math.min(32,now-last);last=now;if(keys.has("ArrowLeft")||keys.has("a")||keys.has("A"))player.x-=player.speed;if(keys.has("ArrowRight")||keys.has("d")||keys.has("D"))player.x+=player.speed;player.x=Math.max(0,Math.min(canvas.width-player.w,player.x));spawn+=dt;if(spawn>600){spawn=0;spawnTarget()}for(let i=targets.length-1;i>=0;i--){const t=targets[i];t.y+=t.speed*dt/16;if(hit(player,t)){end();return}if(t.y>canvas.height){targets.splice(i,1);score++;scoreEl.textContent=String(score)}}draw();raf=requestAnimationFrame(loop)}document.addEventListener("keydown",e=>{keys.add(e.key);if(e.key===" "&&!running)reset()});document.addEventListener("keyup",e=>keys.delete(e.key));canvas.addEventListener("pointermove",e=>{if(e.buttons===1||e.pointerType==="touch"){const r=canvas.getBoundingClientRect();player.x=Math.max(0,Math.min(canvas.width-player.w,(e.clientX-r.left)*canvas.width/r.width-player.w/2));if(!running)reset()}});document.getElementById("start").onclick=reset;draw();</script></body></html>`;
}

export function generateUniversalProject(command){
  const blueprint=inferBlueprint(command);
  const html=blueprint.features.game?gameHtml(blueprint):appHtml(blueprint);
  const server=`import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
export function createServer(){
  return http.createServer((req,res)=>{
    if(req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify({status:"ok",service:"${blueprint.name}",engine:"jora-universal-builder"}))}
    if(req.url==="/api/capabilities"){res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify({engine:"jora-universal-builder",kind:"${blueprint.kind}",features:${JSON.stringify(blueprint.features)},entities:${JSON.stringify(blueprint.entities)}}))}
    res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(html);
  });
}
if(import.meta.url==="file://"+process.argv[1]){const port=Number(process.env.PORT||3000);createServer().listen(port,()=>console.log("Jora Universal Builder project listening on "+port))}
`;
  const test=`import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "../src/index.js";
test("universal project is runnable and exposes inferred capabilities",async()=>{
  const html=await readFile(new URL("../src/index.html",import.meta.url),"utf8");
  assert.match(html,/<script>/);assert.match(html,/localStorage/);
  if(\${blueprint.features.game})assert.match(html,/requestAnimationFrame\\\\(loop\\\\)/);
  const server=createServer();await new Promise(resolve=>server.listen(0,resolve));
  const health=await fetch("http://127.0.0.1:"+server.address().port+"/health");
  assert.equal(health.status,200);assert.equal((await health.json()).status,"ok");
  const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/capabilities");
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.engine,"jora-universal-builder");assert.equal(body.kind,"\${blueprint.kind}");
  await new Promise(resolve=>server.close(resolve));
});
`;
  const readme="# "+blueprint.title+"\\n\\nGenerated by Jora Universal Builder from one natural-language request.\\n\\n## Request\\n"+command+"\\n\\n## Inferred blueprint\\n- Kind: "+blueprint.kind+"\\n- Entities: "+blueprint.entities.map(x=>x.label).join(", ")+"\\n- Platform: "+blueprint.requirements.platform.join(", ")+"\\n- User flows: "+(blueprint.requirements.userFlows.join(", ")||"core flow")+"\\n- UI: "+(blueprint.requirements.ui.join(", ")||"core UI")+"\\n- Data: "+(blueprint.requirements.data.join(", ")||"local state")+"\\n- API: "+(blueprint.requirements.api.join(", ")||"health/capabilities")+"\\n- Features: "+(Object.entries(blueprint.features).filter(([,v])=>v).map(([k])=>k).join(", ")||"core application")+"\\n\\n## Run\\nnpm start\\n\\n## Verify\\nnpm test\\n";
  const baseFiles=[
    {path:"package.json",content:JSON.stringify({name:blueprint.name,version:"0.1.0",private:true,type:"module",scripts:{start:"node src/index.js",test:"node --test"},engines:{node:">=20"}},null,2)},
    {path:"src/index.js",content:server},{path:"src/index.html",content:html},{path:"test/index.test.js",content:test},{path:"README.md",content:readme}
  ];
  const generation=compilePlanToCode(blueprint.projectBlueprint,blueprint.plan,baseFiles);
  return {name:blueprint.name,blueprint,generation,files:generation.files};
}
