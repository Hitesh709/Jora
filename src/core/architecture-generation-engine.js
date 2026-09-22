import fs from "node:fs/promises";
import path from "node:path";

const VERSION = "1.0";
const PROTECTED = new Set([
  "test",
  ".jora/acceptance.json",
  ".jora/requirements.json",
  ".jora/engineering-report.json",
  ".jora/code-understanding.json"
]);

function normalize(file = "") {
  return String(file).replace(/\\/g, "/").replace(/^\.\//, "");
}

function safe(file) {
  const p = normalize(file);
  return Boolean(p && !p.startsWith("/") && !p.includes("\0") &&
    !p.split("/").includes("..") && !p.startsWith(".git/") && !p.startsWith("node_modules/"));
}

function protectedPath(file) {
  const p = normalize(file);
  return PROTECTED.has(p) || [...PROTECTED].some(x => p.startsWith(x + "/"));
}

async function exists(root, file) {
  try { await fs.access(path.join(root, file)); return true; } catch { return false; }
}

function blueprintSignals(blueprint = {}) {
  const text = JSON.stringify(blueprint).toLowerCase();
  return {
    api: Boolean(blueprint.api?.length || /api|endpoint|rest|graphql|webhook/.test(text)),
    data: Boolean(blueprint.entities?.length || /database|entity|model|crud|data/.test(text)),
    integrations: Boolean(blueprint.integrations?.length || /stripe|paypal|razorpay|slack|email|integration/.test(text)),
    game: blueprint.kind === "game" || /game|gameplay|level|score/.test(text)
  };
}

function moduleSpec(kind) {
  const specs = {
    api: {
      path: "src/modules/api-contract.js",
      role: "api-contract",
      content: "export const apiContract = {\n  version: \"1.0\",\n  health: \"/health\",\n  capabilities: \"/api/capabilities\"\n};\n"
    },
    data: {
      path: "src/modules/data-contract.js",
      role: "data-contract",
      content: "export const dataContract = {\n  version: \"1.0\",\n  entities: []\n};\n"
    },
    integrations: {
      path: "src/modules/integrations.js",
      role: "integration-contract",
      content: "export const integrationContract = {\n  version: \"1.0\",\n  providers: []\n};\n"
    },
    game: {
      path: "src/modules/gameplay.js",
      role: "gameplay-module",
      content: "export const gameplayContract = {\n  version: \"1.0\",\n  mechanics: []\n};\n"
    }
  };
  return specs[kind];
}

export async function inspectArchitecture(root, blueprint = {}) {
  const files = [];
  async function walk(current = root) {
    for (const entry of await fs.readdir(current, {withFileTypes:true})) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else files.push(normalize(path.relative(root, abs)));
    }
  }
  await walk();
  const signals = blueprintSignals(blueprint);
  const missing = [];
  for (const kind of Object.keys(signals)) {
    if (!signals[kind]) continue;
    const spec = moduleSpec(kind);
    if (!(await exists(root, spec.path))) missing.push(spec);
  }
  const source = files.filter(x => /\.(js|mjs|cjs|ts|tsx|jsx)$/.test(x));
  const oversized = [];
  for (const file of source.slice(0,80)) {
    try {
      const content = await fs.readFile(path.join(root,file),"utf8");
      if (content.split("\n").length > 180) oversized.push({file,lines:content.split("\n").length});
    } catch {}
  }
  return {version:VERSION,signals,files,missing,oversized};
}

export function buildArchitectureGenerationPlan(inspection) {
  const creates = (inspection.missing || []).map(spec => ({
    operation:"create", path:spec.path, content:spec.content, role:spec.role
  }));
  const refactors = (inspection.oversized || []).map(item => ({
    operation:"review-refactor", path:item.file, lines:item.lines,
    reason:"Source file exceeds the architecture size threshold; inspect before extracting responsibilities."
  }));
  if (inspection.files?.includes("src/modules/api-contract.js") && inspection.files?.includes("src/index.js")) {
    refactors.push({
      operation:"replace-source",
      path:"src/index.js",
      replacements:[
        {before:'"/health"',after:"apiContract.health"},
        {before:'"/api/capabilities"',after:"apiContract.capabilities"}
      ],
      importLine:'import {apiContract} from "./modules/api-contract.js";',
      reason:"Centralize API route contracts in the generated API architecture module."
    });
  }
  return {
    version:VERSION,
    strategy:creates.length ? "generate-missing-modules" : refactors.length ? "refactor-candidates" : "architecture-stable",
    creates,
    refactors,
    steps: [
      {id:"inspect",action:"inspect-current-architecture"},
      {id:"plan",action:"map-blueprint-to-architecture-modules"},
      {id:"generate",action:"create-missing-source-modules"},
      {id:"refactor",action:"apply-only-safe-exact-refactors"},
      {id:"regression",action:"run-regression-gates"}
    ],
    guardrails: [
      "Never modify tests or acceptance artifacts.",
      "Never write outside the workspace.",
      "Only create modules justified by blueprint requirements.",
      "Never perform broad text rewrites during refactoring.",
      "Require regression verification after structural changes."
    ]
  };
}

export function validateArchitectureGenerationPlan(plan) {
  const reasons = [];
  for (const item of [...(plan?.creates || []), ...(plan?.refactors || [])]) {
    if (!safe(item.path)) reasons.push("unsafe path: " + item.path);
    if (protectedPath(item.path)) reasons.push("protected path: " + item.path);
  }
  for (const item of plan?.creates || []) {
    if (item.operation === "create" && (typeof item.content !== "string" || !item.content.trim())) reasons.push("empty generated module: " + item.path);
    if (!["create","replace-source","review-refactor"].includes(item.operation)) reasons.push("unsupported architecture operation: " + item.operation);
    if (typeof item.content !== "string" || !item.content.trim()) reasons.push("empty generated module: " + item.path);
  }
  return {valid:reasons.length === 0,reasons};
}

export async function applyArchitectureGeneration(root, plan, {runTests} = {}) {
  const validation = validateArchitectureGenerationPlan(plan);
  if (!validation.valid) return {status:"REJECTED",created:[],rollback:[],validation};

  const created = [];
  try {
    for (const item of plan.creates || []) {
      if (await exists(root,item.path)) continue;
      await fs.mkdir(path.dirname(path.join(root,item.path)),{recursive:true});
      await fs.writeFile(path.join(root,item.path),item.content,"utf8");
      created.push(item.path);
    }
    for (const item of plan.refactors || []) {
      if (item.operation !== "replace-source") continue;
      const target = await fs.readFile(path.join(root,item.path),"utf8");
      let next = target;
      for (const replacement of item.replacements || []) {
        if (!next.includes(replacement.before)) throw new Error("refactor precondition not satisfied: " + item.path);
        next = next.replace(replacement.before,replacement.after);
      }
      if (item.importLine && !next.includes(item.importLine)) {
        next = item.importLine + "\n" + next;
      }
      if (next !== target) {
        if (!safe(item.path) || protectedPath(item.path)) throw new Error("unsafe refactor target: " + item.path);
        if (!created.includes(item.path)) created.push(item.path + " (refactored)");
        await fs.writeFile(path.join(root,item.path),next,"utf8");
      }
    }
    if (typeof runTests === "function") {
      const tests = await runTests(root);
      if (!tests?.passed) throw new Error("regression failed after architecture generation");
      return {status:"GENERATED",created,rollback:[],validation,tests};
    }
    return {status:"GENERATED",created,rollback:[],validation};
  } catch (error) {
    for (const file of created) {
      try { await fs.rm(path.join(root,file),{force:true}); } catch {}
    }
    return {status:"ROLLED_BACK",created:[],rollback:created,validation,error:error.message};
  }
}

export async function persistArchitectureGenerationReport(root, report) {
  await fs.mkdir(path.join(root, ".jora"), {recursive:true});
  await fs.writeFile(
    path.join(root, ".jora", "architecture-generation.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  return report;
}

export async function runArchitectureGenerationLoop(root, {blueprint={},runTests} = {}) {
  const inspection = await inspectArchitecture(root,blueprint);
  const plan = buildArchitectureGenerationPlan(inspection);
  if (!plan.creates.length) {
    return {version:VERSION,status:"NO_GENERATION_NEEDED",generated:false,inspection,plan};
  }
  const result = await applyArchitectureGeneration(root,plan,{runTests});
  return {
    version:VERSION,
    status:result.status === "GENERATED" ? "ARCHITECTURE_GENERATED" :
      result.status === "ROLLED_BACK" ? "ARCHITECTURE_GENERATION_ROLLED_BACK" : "ARCHITECTURE_GENERATION_REJECTED",
    generated:result.status === "GENERATED",
    inspection,plan,result
  };
}

export default {
  inspectArchitecture,
  buildArchitectureGenerationPlan,
  validateArchitectureGenerationPlan,
  applyArchitectureGeneration,
  runArchitectureGenerationLoop,
  persistArchitectureGenerationReport
};
