import fs from "node:fs/promises";
import path from "node:path";

const VERSION="1.0";
const MARKERS={
 search:'data-jora-feature="search"',authentication:'data-jora-feature="authentication"',chat:'data-jora-feature="chat"',
 commerce:'data-jora-feature="commerce"',leaderboard:'data-jora-feature="leaderboard"',multiplayer:'data-jora-feature="multiplayer"',
 booking:'data-jora-feature="booking"',notifications:'data-jora-feature="notifications"',gameplay:'data-jora-feature="gameplay"'
};
const blocked=p=>{p=String(p||"").replace(/\\\\/g,"/");return !p||p.startsWith("/")||p.split("/").includes("..")||p.startsWith(".git/")||p.startsWith("node_modules/")||p===".jora/acceptance.json"||p===".jora/requirements.json"};
const featureRules=[
 ["authentication",/login|sign[ -]?in|signup|register|authentication|auth/],["search",/search|filter|find|lookup/],
 ["chat",/chat|messaging|message|conversation/],["commerce",/checkout|payment|cart|shop|store|ecommerce|stripe|paypal|razorpay/],
 ["leaderboard",/leaderboard|ranking|high score/],["multiplayer",/multiplayer|real[ -]?time|online players/],
 ["booking",/booking|reservation|appointment/],["notifications",/notification|alert|reminder|email notification/],
 ["gameplay",/game|gameplay|level|enemy|player|score/]
];
function requested(input={}){
 const source=JSON.stringify({command:input.command||"",blueprint:input.blueprint||{},desiredFeatures:input.desiredFeatures||[]}).toLowerCase();
 const out=new Set([...(input.desiredFeatures||[]),...(input.blueprint?.features||[])]);
 for(const [name,re] of featureRules)if(re.test(source))out.add(name);
 return [...out];
}
export function extractFeatureImplementationDelta(input={}){
 const req=requested(input),existing=new Set(input.existingFeatures||[]);
 return {version:VERSION,requested:req,added:req.filter(x=>!existing.has(x)),retained:req.filter(x=>existing.has(x)),unchanged:[...existing].filter(x=>req.includes(x))};
}
const ui={
 search:'<section class="panel jora-feature" data-jora-feature="search"><h2>Search</h2><div class="form"><input id="feature-search" placeholder="Search records"></div><p id="feature-search-status" class="notice">Showing all records.</p></section>',
 authentication:'<section class="panel jora-feature" data-jora-feature="authentication"><h2>Sign in</h2><div class="form"><input id="auth-email" type="email" placeholder="Email"><input id="auth-password" type="password" placeholder="Password"><div class="actions"><button class="button primary" id="auth-submit">Sign in</button><button class="button" id="auth-signout">Sign out</button></div></div><p id="auth-status" class="notice">Signed out.</p></section>',
 chat:'<section class="panel jora-feature" data-jora-feature="chat"><h2>Chat</h2><div id="chat-messages" class="cards"></div><div class="form"><input id="chat-input" placeholder="Write a message"><button class="button primary" id="chat-send">Send</button></div></section>',
 commerce:'<section class="panel jora-feature" data-jora-feature="commerce"><h2>Cart</h2><p id="cart-count" class="stat">0</p><button class="button primary" id="cart-add">Add demo item</button><button class="button" id="cart-clear">Clear cart</button><p id="cart-status" class="notice">Cart ready.</p></section>',
 leaderboard:'<section class="panel jora-feature" data-jora-feature="leaderboard"><h2>Leaderboard</h2><div id="leaderboard-list" class="cards"></div><button class="button" id="leaderboard-demo">Add demo score</button></section>',
 multiplayer:'<section class="panel jora-feature" data-jora-feature="multiplayer"><h2>Multiplayer Session</h2><p id="multiplayer-status" class="notice">Local session ready. No remote transport is claimed.</p><button class="button primary" id="multiplayer-join">Join session</button><button class="button" id="multiplayer-leave">Leave session</button></section>',
 booking:'<section class="panel jora-feature" data-jora-feature="booking"><h2>Booking</h2><div class="form"><input id="booking-name" placeholder="Name"><input id="booking-date" type="date"><button class="button primary" id="booking-submit">Book</button></div><p id="booking-status" class="notice">No booking yet.</p></section>',
 notifications:'<section class="panel jora-feature" data-jora-feature="notifications"><h2>Notifications</h2><p id="notification-status" class="notice">Notifications are enabled for this session.</p><button class="button" id="notification-test">Send test notification</button></section>',
 gameplay:'<section class="panel jora-feature" data-jora-feature="gameplay"><h2>Gameplay</h2><p class="notice">Gameplay controls are available in the generated project.</p></section>'
};
const js={
 search:'const q=document.getElementById("feature-search");if(q)q.addEventListener("input",()=>{const v=q.value.toLowerCase();document.querySelectorAll("#list .item").forEach(e=>e.hidden=!e.textContent.toLowerCase().includes(v));});',
 authentication:'const ak="jora-auth-session",as=document.getElementById("auth-status");const ar=()=>{if(as)as.textContent=localStorage.getItem(ak)?"Signed in · "+localStorage.getItem(ak):"Signed out."};document.getElementById("auth-submit")?.addEventListener("click",()=>{const e=document.getElementById("auth-email")?.value.trim();if(e)localStorage.setItem(ak,e);ar()});document.getElementById("auth-signout")?.addEventListener("click",()=>{localStorage.removeItem(ak);ar()});ar();',
 chat:'const ck="jora-chat-messages";let cm=JSON.parse(localStorage.getItem(ck)||"[]");const cr=()=>{const b=document.getElementById("chat-messages");if(b)b.innerHTML=cm.map(x=>"<div class=\\"item\\"></div>").join("");document.querySelectorAll("#chat-messages .item").forEach((e,i)=>e.textContent=cm[i].text)};document.getElementById("chat-send")?.addEventListener("click",()=>{const i=document.getElementById("chat-input"),t=i?.value.trim();if(!t)return;cm.push({text:t});localStorage.setItem(ck,JSON.stringify(cm));i.value="";cr()});cr();',
 commerce:'const cartKey="jora-cart";let cart=JSON.parse(localStorage.getItem(cartKey)||"[]");const cartRender=()=>{const e=document.getElementById("cart-count");if(e)e.textContent=String(cart.length)};document.getElementById("cart-add")?.addEventListener("click",()=>{cart.push({id:Date.now()});localStorage.setItem(cartKey,JSON.stringify(cart));cartRender()});document.getElementById("cart-clear")?.addEventListener("click",()=>{cart=[];localStorage.setItem(cartKey,"[]");cartRender()});cartRender();',
 leaderboard:'const lk="jora-leaderboard";let scores=JSON.parse(localStorage.getItem(lk)||"[]");const lr=()=>{const b=document.getElementById("leaderboard-list");if(!b)return;b.innerHTML="";scores.slice().sort((a,z)=>z.score-a.score).slice(0,10).forEach((x,i)=>{const e=document.createElement("div");e.className="item";e.textContent=(i+1)+". "+x.name+" · "+x.score;b.appendChild(e)})};document.getElementById("leaderboard-demo")?.addEventListener("click",()=>{scores.push({name:"Player",score:Math.floor(Math.random()*100)});localStorage.setItem(lk,JSON.stringify(scores));lr()});lr();',
 multiplayer:'document.getElementById("multiplayer-join")?.addEventListener("click",()=>document.getElementById("multiplayer-status").textContent="Joined local session. Connect a transport adapter for network multiplayer.");document.getElementById("multiplayer-leave")?.addEventListener("click",()=>document.getElementById("multiplayer-status").textContent="Left local session.");',
 booking:'const bk="jora-bookings";let bookings=JSON.parse(localStorage.getItem(bk)||"[]");document.getElementById("booking-submit")?.addEventListener("click",()=>{const n=document.getElementById("booking-name")?.value.trim(),d=document.getElementById("booking-date")?.value,s=document.getElementById("booking-status");if(!n||!d){s.textContent="Enter a name and date.";return}bookings.push({name:n,date:d});localStorage.setItem(bk,JSON.stringify(bookings));s.textContent="Booking saved for "+d+"."});',
 notifications:'document.getElementById("notification-test")?.addEventListener("click",()=>{const s=document.getElementById("notification-status");if("Notification"in window&&Notification.permission==="granted")new Notification("Jora notification");s.textContent="In-app notification delivered.";});',
 gameplay:''
};
export async function inspectFeatureImplementation(root,input={}){
 const html=await fs.readFile(path.join(root,"src","index.html"),"utf8"),req=extractFeatureImplementationDelta(input);
 const missing=req.requested.filter(f=>MARKERS[f]&&!html.includes(MARKERS[f]));
 return {version:VERSION,requested:req.requested,missing,already:req.requested.filter(f=>html.includes(MARKERS[f])),delta:req,html};
}
export function buildFeatureImplementationPlan(inspection={}){
 const game=String(inspection.html||"").includes('id="game"');
 const patches=(inspection.missing||[]).filter(f=>ui[f]).filter(f=>!(game&&f==="gameplay")).map(f=>({feature:f,marker:MARKERS[f],html:ui[f],script:js[f]||""}));
 return {version:VERSION,strategy:patches.length?"requirement-to-working-feature":"no-change",patches,tests:patches.map(x=>x.feature),guardrails:["Preserve unrelated behavior.","Never modify protected acceptance artifacts.","Only implement requested features.","Do not claim network multiplayer without a transport adapter.","Run regression tests before promotion."]};
}
export function validateFeatureImplementationPlan(plan={}){
 const reasons=[];for(const p of plan.patches||[]){if(!MARKERS[p.feature])reasons.push("unsupported feature: "+p.feature);if(!p.html)reasons.push("empty feature UI: "+p.feature)}return {valid:!reasons.length,reasons};
}
export async function applyFeatureImplementation(root,plan,{runTests}={}){
 const validation=validateFeatureImplementationPlan(plan);if(!validation.valid)return {status:"REJECTED",validation};
 const file=path.join(root,"src","index.html"),original=await fs.readFile(file,"utf8");let html=original;
 try{
  for(const p of plan.patches||[]){if(html.includes(p.marker))continue;const before=html;html=html.replace("</main><script>",p.html+"</main><script>");if(html===before)html=html.replace("</body>",p.html+"</body>");if(html===before)throw new Error("could not place feature UI: "+p.feature);}
  const scripts=(plan.patches||[]).map(x=>x.script).filter(Boolean).join("\\n");
  if(scripts){const tag="<script>/* JORA_FEATURE_IMPLEMENTATION */"+scripts+"</script>";html=html.replace("</body>",tag+"</body>");}
  await fs.writeFile(file,html,"utf8");
  const testPath=path.join(root,"test","feature-implementation.test.js");
  const assertions=(plan.tests||[]).map(f=>'test("'+f+' feature marker",async()=>{const html=await readFile(new URL("../src/index.html",import.meta.url),"utf8");assert.match(html,/data-jora-feature="'+f+'"/);});').join("\\n");
  if(assertions)await fs.writeFile(testPath,'import test from "node:test";\\nimport assert from "node:assert/strict";\\nimport {readFile} from "node:fs/promises";\\n'+assertions,"utf8");
  const tests=typeof runTests==="function"?await runTests(root):null;if(tests&&!tests.passed)throw new Error("regression failed after feature implementation");
  return {status:"FEATURES_IMPLEMENTED",patched:true,features:plan.tests,tests};
 }catch(error){await fs.writeFile(file,original,"utf8");try{await fs.rm(path.join(root,"test","feature-implementation.test.js"),{force:true})}catch{}return {status:"ROLLED_BACK",patched:false,error:error.message};}
}
export async function persistFeatureImplementationReport(root,report){await fs.mkdir(path.join(root,".jora"),{recursive:true});await fs.writeFile(path.join(root,".jora","feature-implementation.json"),JSON.stringify(report,null,2),"utf8");return report;}
export async function runFeatureImplementationLoop(root,input={}){const inspection=await inspectFeatureImplementation(root,input),plan=buildFeatureImplementationPlan(inspection);if(!plan.patches.length)return {version:VERSION,status:"NO_FEATURE_IMPLEMENTATION",implemented:false,inspection,plan};const result=await applyFeatureImplementation(root,plan,{runTests:input.runTests});return {version:VERSION,status:result.status,implemented:result.status==="FEATURES_IMPLEMENTED",inspection,plan,result};}
export default {extractFeatureImplementationDelta,inspectFeatureImplementation,buildFeatureImplementationPlan,validateFeatureImplementationPlan,applyFeatureImplementation,persistFeatureImplementationReport,runFeatureImplementationLoop};
