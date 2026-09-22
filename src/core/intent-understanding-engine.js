/**
 * Jora Intent Understanding Engine
 *
 * Converts natural language into a stable intent contract before chat/build routing.
 * Supports mixed-language input, including Gujarati written with Latin letters.
 */
const clean = (value="") => String(value ?? "").replace(/\s+/g, " ").trim();

const GUJARATI_SCRIPT = /[\u0A80-\u0AFF]/;
const DEVANAGARI_SCRIPT = /[\u0900-\u097F]/;

const gujaratiRoman = [
  ["kem cho", "how are you"],["kem chho", "how are you"],["tame kem cho", "how are you"],
  ["tame kem chho", "how are you"],["shu tame", "can you"],["shu che", "what is"],
  ["shu chhe", "what is"],["mane samjavo", "explain to me"],["mane samjaavo", "explain to me"],
  ["mane samajatu nathi", "I do not understand"],["mane samjatu nathi", "I do not understand"],
  ["mane joiye", "I need"],["mane joie", "I need"],["mare", "I want"],["maru", "my"],
  ["maro", "my"],["mari", "my"],["aapde", "we"],["aapvu", "give"],["aapo", "give"],
  ["aapjo", "give"],["aavshe", "will come"],["aavvu", "come"],["jaavu", "go"],["karvu", "do"],
  ["karo", "do"],["kare", "do"],["karyu", "did"],["banavvu", "build"],["banavani", "build"],
  ["banavo", "build"],["banavi", "build"],["mukvu", "put"],["muko", "put"],["jovu", "see"],
  ["jova", "see"],["samajavu", "understand"],["samjavo", "explain"],["shikhvo", "teach"],
  ["shikhavvu", "teach"],["pachi", "then"],["pehla", "first"],["have", "now"],["atyare", "now"],
  ["aama", "in this"],["ema", "in it"],["aa", "this"],["aavu", "this kind of"],["evu", "that kind of"],
  ["ek", "a"],["be", "two"],["ketlu", "how much"],["ketla", "how many"],["kyare", "when"],
  ["kya", "where"],["kyaare", "when"],["kon", "who"],["kem", "why"],["kevi rite", "how"],
  ["kai rite", "how"],["kai", "which"],["pan", "also"],["ane", "and"],["athva", "or"],
  ["nathi", "not"],["nahi", "not"],["che", ""],["chhe", ""],["chu", ""],["chhu", ""],["cho", ""],
  ["to", "then"],["j", ""],["ma", "in"],["par", "on"],["mate", "for"]
];

const hindiRoman = [
  ["mujhe", "I need"],["mujhko", "I need"],["mera", "my"],["meri", "my"],["mere", "my"],
  ["banana hai", "I want to build"],["banao", "build"],["banado", "build"],["karo", "do"],
  ["samjhao", "explain"],["samjha do", "explain"],["kya", "what"],["kyun", "why"],
  ["kaise", "how"],["kab", "when"],["kahan", "where"],["kaun", "who"],["yeh", "this"],
  ["ye", "this"],["us", "that"],["isme", "in this"],["ismein", "in this"],["phir", "then"],
  ["abhi", "now"],["aur", "and"],["bhi", "also"],["nahi", "not"],["chahiye", "need"],["hai", ""]
];

const actionWords = {
  build: /\b(build|create|make|develop|design|generate|implement|code|write|scaffold|banav|banavi|banavo|banavvu|banao)\b/i,
  modify: /\b(modify|update|change|edit|improve|add|remove|replace|refactor|fix|repair|enhance|upgrade|muko|mukvu)\b/i,
  debug: /\b(debug|bug|error|broken|not working|fix|repair|crash|issue|problem)\b/i,
  test: /\b(test|testing|verify|check|qa)\b/i,
  deploy: /\b(deploy|publish|ship|launch|release|production)\b/i,
  research: /\b(research|search|look up|find out|latest|current|news|compare|source)\b/i,
  explain: /\b(explain|teach|what is|why does|how does|samjavo|samjaavo|samjhao)\b/i
};

const questionWords = /^(what|why|how|when|where|who|which|can you explain|tell me|could you explain|shu|kem|kyare|kya|kon|kai|kevi rite|kai rite)\b/i;

function phraseReplace(input, table) {
  let out = clean(input).toLowerCase();
  for (const [from, to] of [...table].sort((a,b) => b[0].length - a[0].length)) {
    const escaped = from.replace(/[.*+?^()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("(^|\\s)" + escaped + "(?=\\s|$)", "gi");
    out = out.replace(pattern, (_, prefix) => (prefix + to).replace(/\\s+/g, " "));
  }
  return clean(out);
}

function normalizePunctuation(input) {
  return clean(input).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[。？！]/g, ".").replace(/\s+([,.!?])/g, "$1");
}

function looksGujaratiRoman(text) {
  const lower = text.toLowerCase();
  const markers = ["mane ","mare ","mari ","maru ","mara ","aama ","ema ","shu ","kem ","tame ","chu","chhu","cho","che","chhe","joiye","banav","karo","samjavo","pachi","kyare","kya"];
  return markers.filter(x => lower.includes(x)).length >= 1;
}

function detectLanguage(text) {
  const value = clean(text);
  if (GUJARATI_SCRIPT.test(value)) return {code:"gu",name:"Gujarati",script:"Gujarati"};
  if (DEVANAGARI_SCRIPT.test(value)) return {code:"hi",name:"Hindi",script:"Devanagari"};
  if (looksGujaratiRoman(value)) return {code:"gu-Latn",name:"Gujarati (Latin)",script:"Latin"};
  const lower = value.toLowerCase();
  const hindiHits = ["mujhe","mujhko","chahiye","samjhao","kaise","kya","kyun","kahan","kab"].filter(x => lower.includes(x)).length;
  if (hindiHits >= 1) return {code:"hi-Latn",name:"Hindi (Latin)",script:"Latin"};
  return {code:"en",name:"English",script:"Latin"};
}

function normalizeUserText(input, language) {
  let value = normalizePunctuation(input);
  if (language.code === "gu-Latn") value = phraseReplace(value, gujaratiRoman);
  else if (language.code === "hi-Latn") value = phraseReplace(value, hindiRoman);
  return clean(value);
}

function inferAction(text) {
  const lower = text.toLowerCase();
  const matches = [];
  for (const [action, pattern] of Object.entries(actionWords)) if (pattern.test(lower)) matches.push(action);
  if (matches.includes("debug")) return "debug";
  if (matches.includes("build")) return "build";
  if (matches.includes("deploy")) return "deploy";
  if (matches.includes("modify")) return "modify";
  if (matches.includes("test")) return "test";
  if (matches.includes("research")) return "research";
  if (matches.includes("explain")) return "answer";
  if (questionWords.test(lower) || /\?$/.test(lower)) return "answer";
  return "answer";
}

function inferDomain(text) {
  const lower = text.toLowerCase();
  if (/\b(game|games|snake|pong|tetris|racing|racer|shooter|platformer|arcade|puzzle)\b/.test(lower)) return "game";
  if (/\b(api|backend|server|endpoint|rest|graphql|webhook)\b/.test(lower)) return "api";
  if (/\b(website|web app|webapp|application|app|dashboard|platform|software|project)\b/.test(lower)) return "software";
  if (/\b(github|git|repository|repo|branch|pull request)\b/.test(lower)) return "code";
  return "general";
}

function confidenceFor({action,language,normalized,original}) {
  let score = 0.58;
  if (language.code !== "en") score += 0.04;
  if (normalized !== original.toLowerCase()) score += 0.08;
  if (action !== "answer") score += 0.12;
  if (action === "answer" && questionWords.test(normalized.toLowerCase())) score += 0.12;
  return Math.min(0.99, Number(score.toFixed(2)));
}

export class IntentUnderstandingEngine {
  understand({input,messages=[],context={}}={}) {
    const original = clean(input);
    if (!original) return {version:"1.0",intent:"conversation.answer",action:"answer",language:{code:"en",name:"English",script:"Latin"},originalText:"",normalizedText:"",domain:"general",confidence:0,entities:{},context:{hasConversation:false,references:[]},clarificationNeeded:true};
    const language = detectLanguage(original);
    const normalizedText = normalizeUserText(original, language);
    const action = inferAction(normalizedText);
    const domain = inferDomain(normalizedText);
    const recent = Array.isArray(messages) ? messages.slice(-12).filter(x => x && typeof x.content === "string") : [];
    const references = [];
    const lower = original.toLowerCase();
    if (/\b(this|that|it|aa|aama|ema|aavu|evu)\b/.test(lower)) references.push("previous-turn-object");
    if (/\b(same|again|continue|pachi|phir|then)\b/.test(lower)) references.push("previous-turn-action");
    if (/\b(as before|previous|earlier|last one|pehla)\b/.test(lower)) references.push("previous-turn-context");
    const confidence = confidenceFor({action,language,normalized:normalizedText,original});
    const clarificationNeeded = confidence < 0.62 || (action !== "answer" && normalizedText.length < 8);
    return {
      version:"1.0",
      intent:action === "answer" ? "conversation.answer" : "engineering."+action,
      action,language,originalText:original,normalizedText,domain,confidence,
      entities:{
        explicitPlatform:/\b(mobile|android|ios|web|website)\b/i.test(normalizedText) ? (normalizedText.match(/\b(mobile|android|ios|web|website)\b/i)?.[1]||null) : null,
        gameType:domain === "game" ? (normalizedText.match(/\b(snake|pong|tetris|racing|racer|shooter|platformer|puzzle)\b/i)?.[1]||null) : null
      },
      context:{hasConversation:recent.length > 0,turns:recent.length,references},
      clarificationNeeded
    };
  }
}

export function createIntentUnderstandingEngine(options) { return new IntentUnderstandingEngine(options); }
export {detectLanguage,normalizeUserText,inferAction,inferDomain};
