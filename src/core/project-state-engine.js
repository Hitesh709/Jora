/**
 * Jora Phase 2 Project State Engine
 *
 * Builds a compact, serializable state for the active software project from
 * conversation turns. The state is deliberately deterministic so it can be
 * persisted by a client, API, queue, or future durable project store.
 */

const clean=(value="")=>String(value??"").replace(/\s+/g," ").trim();

const ACTION_RE=/\b(build|create|make|develop|design|add|include|change|update|modify|edit|fix|repair|debug|improve|upgrade|remove|delete|replace|refactor|implement|test|deploy|publish|launch|banav|banavo|banavi|banavvu|karo|karvu|muko|mukvu)\b/i;

export function normalizeProjectState(input={}) {
  const source=input&&typeof input==="object"?input:{};
  return {
    version:2,
    project:source.project||null,
    domain:source.domain||null,
    goal:source.goal||null,
    requirements:Array.isArray(source.requirements)?source.requirements.filter(Boolean).slice(-100):[],
    completed:Array.isArray(source.completed)?source.completed.filter(Boolean).slice(-100):[],
    pending:Array.isArray(source.pending)?source.pending.filter(Boolean).slice(-100):[],
    constraints:Array.isArray(source.constraints)?source.constraints.filter(Boolean).slice(-100):[],
    lastAction:source.lastAction||null,
    lastRequest:source.lastRequest||null,
    turnCount:Number(source.turnCount)||0
  };
}

function projectFromText(text) {
  const value=clean(text);
  const match=value.match(/\b(?:build|create|make|develop|design)\s+(?:me\s+)?(?:a|an|the)\s+(.+?)(?:[.!?]|$)/i);
  if(match?.[1] && /\b(game|app|application|website|web app|software|platform|project|api|dashboard)\b/i.test(match[1])) return clean(match[1]);
  const guj=value.match(/(?:mara mate|mare|mane)\s+(.+?)\s+(?:banavo|banavi|banavvu|banavvi|banav|banao)\b/i);
  return guj?.[1]?clean(guj[1]):null;
}

function requirementFromText(text) {
  const value=clean(text);
  if(!value || !ACTION_RE.test(value)) return null;
  const stripped=value.replace(/^[,.;:!?\s]+/,"");
  return stripped;
}

function classifyAction(text) {
  const value=clean(text).toLowerCase();
  if (/\b(debug|bug|error|broken|not working|crash|repair|fix)\b/.test(value)) return "debug";
  if (/\b(add|include|change|update|modify|edit|improve|upgrade|remove|delete|replace|refactor|implement|karo|muko)\b/.test(value)) return "modify";
  if (/\b(build|create|make|develop|design|banav|banavo|banavi|banavvu|banao)\b/.test(value)) return "build";
  if (/\b(test|verify|check|qa)\b/.test(value)) return "test";
  if (/\b(deploy|publish|launch|ship|release)\b/.test(value)) return "deploy";
  return "answer";
}

function inferDomain(text) {
  const value=clean(text).toLowerCase();
  if (/\b(game|racing|racer|snake|pong|tetris|shooter|platformer|sudoku|chess)\b/.test(value)) return "game";
  if (/\b(api|backend|endpoint|rest|graphql|webhook)\b/.test(value)) return "api";
  if (/\b(website|web app|webapp|application|app|dashboard|platform|software)\b/.test(value)) return "software";
  return null;
}

export function updateProjectState(previous={}, {input="", understanding=null}={}) {
  const state=normalizeProjectState(previous);
  const original=clean(input);
  const action=understanding?.action||classifyAction(original);
  const domain=understanding?.domain||inferDomain(original);
  const candidate=projectFromText(original);
  const project=candidate||state.project||understanding?.context?.resolvedReferences?.object||null;

  if(domain && domain!=="general") state.domain=domain;
  if(project && !/^previous-turn-/i.test(project)) state.project=project;

  if(action!=="answer") {
    state.lastAction=action;
    state.lastRequest=original;
    state.turnCount+=1;
  }

  if(action==="build" && original) {
    state.goal=state.goal||original;
    const req=requirementFromText(original);
    if(req && !state.requirements.includes(req)) state.requirements.push(req);
  } else if(["modify","debug","test","deploy"].includes(action) && original) {
    const req=requirementFromText(original);
    if(req && !state.requirements.includes(req)) state.requirements.push(req);
    if(action==="debug" && req && !state.pending.includes(req)) state.pending.push(req);
  }

  if(understanding?.scope?.existingProject && action!=="build" && original) {
    state.goal=state.goal||state.project;
  }

  state.pending=state.pending.filter(item=>!state.completed.includes(item)).slice(-100);
  state.requirements=state.requirements.slice(-100);
  state.completed=state.completed.slice(-100);
  state.constraints=state.constraints.slice(-100);

  return state;
}

export function mergeProjectState(previous={}, patch={}) {
  const base=normalizeProjectState(previous);
  const next=normalizeProjectState(patch);
  return {
    version:2,
    project:next.project||base.project,
    domain:next.domain||base.domain,
    goal:next.goal||base.goal,
    requirements:[...new Set([...base.requirements,...next.requirements])].slice(-100),
    completed:[...new Set([...base.completed,...next.completed])].slice(-100),
    pending:[...new Set([...base.pending,...next.pending])].slice(-100),
    constraints:[...new Set([...base.constraints,...next.constraints])].slice(-100),
    lastAction:next.lastAction||base.lastAction,
    lastRequest:next.lastRequest||base.lastRequest,
    turnCount:Math.max(base.turnCount,next.turnCount)
  };
}

export function createProjectStateEngine(){ return {update:updateProjectState,merge:mergeProjectState}; }
