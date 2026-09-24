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
  if (/^(yes|yeah|yep|yup|ha|haa|હા|હાા|ok|okay|sure|correct|right|do it|go ahead|continue|ચાલે|બરાબર|ठीक|हाँ|haan|han)$/i.test(value)) return "confirmation";
  if (/^(no|nope|nah|nahi|નહીં|ના|don't|do not|not that|cancel|stop)$/i.test(value)) return "negation";
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

function findRecentProject(messages) {
  const all=messages.filter(x => x.role==="user" || x.role==="assistant");
  const text=all.map(x=>x.content).join(" ");
  const match=text.match(/\b(racing game|snake game|pong|tetris|sudoku|chess|calculator|loan app|dashboard|website|web app|mobile app|api|project|codebase|repository|repo)\b/i);
  return match ? match[1] : null;
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

    return {
      ...current,
      action,
      intent,
      scope,
      context:mergedContext,
      goal,
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
