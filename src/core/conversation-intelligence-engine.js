/**
 * Jora Conversation Intelligence Engine
 *
 * Adds conversation-level reasoning around the lower-level intent engine:
 * - resolves references such as "it", "this", "the app", "same", "again"
 * - detects confirmations/corrections/negations
 * - carries forward the current conversational goal
 * - extracts a compact requirement/goal state
 * - gives downstream routers a stable conversation contract
 */
import {IntentUnderstandingEngine} from "./intent-understanding-engine.js";
import {updateProjectState} from "./project-state-engine.js";

const clean = (value="") => String(value ?? "").replace(/\s+/g, " ").trim();
const last = (items=[]) => items.length ? items[items.length-1] : null;

function normalizeMessages(messages=[]) {
  return (Array.isArray(messages) ? messages : [])
    .filter(x => x && ["system","user","assistant"].includes(x.role) && typeof x.content === "string")
    .slice(-24)
    .map(x => ({role:x.role, content:clean(x.content).slice(0,12000)}));
}

function detectResponseType(text, previousAssistant="") {
  const value=clean(text).toLowerCase();
  if (!value) return "empty";
  const confirmations=new Set(["yes","yeah","yep","yup","ha","haa","haan","han","ok","okay","sure","correct","right","do it","go ahead","continue","ચાલે","બરાબર","ઠીક","ઠીક છે","ठीक","हाँ","હા","હાા","હા કરો","હા કરજો","barabar","barabar che","barabar chhe","thik","thik che","thik chhe","haan karo","haan karjo","haan barabar","ha barabar"]);
  const negations=new Set(["no","nope","nah","na","naa","nahi","nahin","nathi","not","ના","નહીં","નહી","નથી","cancel","stop"]);
  if (negations.has(value)) return "negation";
  if (confirmations.has(value) || /^(?:ha|haa|haan|han|yes|yeah|yep|ok|okay|sure|barabar|barabar che|barabar chhe|thik|thik che|thik chhe)\b[\s,.-]*(?:karo|karjo|do it|go ahead|continue)?$/i.test(value)) return "confirmation";
  if (/^(don't|do not|not that)$/i.test(value)) return "negation";
  if (/\b(actually|instead|rather|wait|no,|not that|i meant|મારો મતલબ|એવું નહીં|નહીં,|लेकिन|लेकिन नहीं)\b/i.test(value)) return "correction";
  if (/\b(why|what|how|when|where|who|shu|kem|kevi rite|kai rite|kyaare|kya|kon)\b/i.test(value) || /\?$/.test(value)) return "question";
  if (/\b(thanks|thank you|thank|શુભ|આભાર|dhanyavaad|thanks)\b/i.test(value)) return "acknowledgement";
  if (/\b(do this|make this|change this|fix this|add this|remove this|build this|aa karo|aama|ema|aane)\b/i.test(value)) return "instruction";
  if (previousAssistant && /\?$/.test(previousAssistant) && value.length <= 40) return "short-follow-up";
  return "statement";
}

function extractReferenceTokens(text) {
  const lower=clean(text).toLowerCase();
  const refs=[];
  if (/\b(it|this|that|these|those|same|again|here|there|the current (app|game|project|codebase)|aa|aama|ema|aane|ene|evu|aavu|એ|આ|આમાં|એમાં)\b/i.test(lower)) refs.push("previous-turn-object");
  if (/\b(same|again|continue|keep going|as before|previous|earlier|last one|pachi|phir|then|પછી|ફરી|પહેલા)\b/i.test(lower)) refs.push("previous-turn-action");
  if (/\b(as before|previous|earlier|last time|last one|pehla|પહેલા|પાછલું)\b/i.test(lower)) refs.push("previous-turn-context");
  return [...new Set(refs)];
}

function extractProjectFromText(text) {
  const value=clean(text);
  const english=value.match(/\b(?:build|create|make|develop|design)\s+(?:me\s+)?(?:a|an|the)\s+(.+?)(?:[.!?]|$)/i);
  if (english?.[1]) {
    const candidate=clean(english[1]).replace(/\b(?:please|for me)\b/gi,"").trim();
    if (/\b(game|app|application|website|web app|software|platform|project|codebase|api|dashboard)\b/i.test(candidate)) return candidate;
  }

  const built=value.match(/\b(?:built|created|made|developed|designed)\s+(?:me\s+)?(?:a|an|the)\s+(.+?)(?:[.!?]|$)/i);
  if (built?.[1]) return clean(built[1]).trim();

  const romanGujarati=value.match(/(?:mara mate|mare|mane)\s+(.+?)\s+(?:banavo|banavi|banavvu|banavvi|banav|banao)\b/i);
  if (romanGujarati?.[1]) return clean(romanGujarati[1]);

  const generic=value.match(/\b((?:mini|simple|complete|full)?\s*(?:[a-z0-9-]+\s+){0,5}(?:game|app|application|website|web app|software|platform))\b/i);
  if (generic?.[1]) return clean(generic[1]);

  return null;
}

function findRecentProject(messages) {
  const all=messages.filter(x => x.role==="user" || x.role==="assistant");
  for (let i=all.length-1;i>=0;i--) {
    const project=extractProjectFromText(all[i].content);
    if (project) return project;
  }
  return null;
}

function findPreviousInstruction(messages) {
  const user=messages.filter(x=>x.role==="user");
  return last(user)?.content || null;
}

function findPendingAssistantQuestion(messages) {
  const assistants=messages.filter(x=>x.role==="assistant");
  for(let i=assistants.length-1;i>=0;i--){
    const content=assistants[i].content;
    if(/\?$/.test(content) || /\b(should i|do you want|would you like|shall i|want me to|can i)\b/i.test(content)) return content;
  }
  return null;
}

function inferConfirmationAction(previousAssistant, previousUser, currentIntent) {
  if (!previousAssistant) return null;
  const lower=previousAssistant.toLowerCase();
  if (!/\b(should i|do you want|would you like|shall i|want me to|can i)\b/i.test(lower) && !/\?$/.test(previousAssistant)) return null;
  if (currentIntent.action !== "answer") return null;
  if (/\b(add|include|enable|turn on|implement|build|create|make|change|modify|fix|remove|delete|update|upgrade|deploy)\b/i.test(lower)) {
    return "modify";
  }
  if (/\b(build|create|make|develop)\b/i.test(lower)) return "build";
  return null;
}

function buildGoal({current, messages, responseType, previousAssistant}) {
  const recentUser=messages.filter(x=>x.role==="user").slice(-6).map(x=>x.content);
  const project=findRecentProject(messages);
  const confirmationAction=inferConfirmationAction(previousAssistant, recentUser.at(-2), current);
  const goalAction=confirmationAction || (current.action !== "answer" ? current.action : null);
  const goalText=recentUser.find(x=>/\b(build|create|make|develop|add|change|fix|modify|update|repair|upgrade|implement|banav|banavo|banavi)\b/i.test(x)) || recentUser.at(-1) || null;
  return {
    active:Boolean(goalText || project || confirmationAction),
    action:goalAction,
    project,
    text:goalText,
    responseType,
    pendingConfirmation:Boolean(previousAssistant && /\?$/.test(previousAssistant))
  };
}

export class ConversationIntelligenceEngine {
  constructor({intentEngine=null}={}) {
    this.intentEngine=intentEngine || new IntentUnderstandingEngine();
  }

  understand({input,messages=[],context={}}={}) {
    const original=clean(input);
    const history=normalizeMessages(messages);
    const current=this.intentEngine.understand({input:original,messages:history,context});
    const previousAssistant=last(history.filter(x=>x.role==="assistant"))?.content || "";
    const userMessages=history.filter(x=>x.role==="user");
    const previousUser=userMessages.filter(x=>x.content!==original).at(-1)?.content
      || userMessages.at(-2)?.content
      || "";
    const responseType=detectResponseType(original,previousAssistant);
    const references=extractReferenceTokens(original);
    const pendingAction=inferConfirmationAction(previousAssistant,previousUser,current);

    let action=current.action;
    let intent=current.intent;
    if (references.length && action==="build" && !/\b(from scratch|new|brand new|another)\b/i.test(original)) {
      action="modify";
      intent="engineering.modify";
    }
    if(responseType==="confirmation" && pendingAction){
      action=pendingAction;
      intent="engineering."+pendingAction;
    }

    const project=findRecentProject(history);
    const resolvedReferences={
      object: references.length ? (project || "previous-turn-object") : null,
      action: references.includes("previous-turn-action") ? (current.action==="answer" ? "previous-turn-action" : current.action) : null,
      context: references.includes("previous-turn-context") ? "previous-conversation-context" : null
    };

    const goal=buildGoal({current:{...current,action},messages:history,responseType,previousAssistant});
    const mergedContext={
      ...(current.context||{}),
      references:[...new Set([...(current.context?.references||[]),...references])],
      responseType,
      resolvedReferences,
      previousAssistantQuestion:previousAssistant || null,
      previousUserMessage:previousUser || null
    };

    const scope={...(current.scope||{})};
    if (pendingAction && scope.scope==="conversation") {
      scope.scope=pendingAction==="build" ? "whole-project" : "existing-project-change";
      scope.existingProject=true;
      scope.wholeProject=pendingAction==="build";
    }

    const priorProjectState=context?.projectState || context?.project?.state || {};
    const projectState=updateProjectState(priorProjectState,{input:original,understanding:{...current,action,scope}});
    return {
      ...current,
      action,
      intent,
      scope,
      context:mergedContext,
      goal,
      projectState,
      conversation:{
        responseType,
        turnCount:history.filter(x=>x.role==="user").length,
        project,
        references,
        pendingConfirmation:Boolean(pendingAction),
        resolvedReferences
      }
    };
  }
}

export function createConversationIntelligenceEngine(options) {
  return new ConversationIntelligenceEngine(options);
}

export {detectResponseType,extractReferenceTokens,findRecentProject};
