import fs from "node:fs/promises";
import path from "node:path";

const VERSION = "1.0";
const PROTECTED = [
  "test",
  ".jora/acceptance.json",
  ".jora/requirements.json",
  ".jora/engineering-report.json",
  ".jora/code-understanding.json"
];

function normalize(filePath = "") {
  return String(filePath).replace(/\\/g, "/").replace(/^\.\//, "");
}

function safePath(filePath) {
  const p = normalize(filePath);
  return Boolean(p && !p.startsWith("/") && !p.includes("\0") &&
    !p.split("/").includes("..") && !p.startsWith(".git/") && !p.startsWith("node_modules/"));
}

function protectedPath(filePath) {
  const p = normalize(filePath);
  return PROTECTED.some(x => p === x || p.startsWith(x + "/"));
}

async function walk(root, current = root, result = []) {
  for (const entry of await fs.readdir(current, {withFileTypes:true})) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) await walk(root, abs, result);
    else result.push(normalize(path.relative(root, abs)));
  }
  return result;
}

async function readSource(root, file) {
  if (!safePath(file)) throw new Error("unsafe path: " + file);
  return fs.readFile(path.join(root, file), "utf8");
}

function failureText(input = {}) {
  return [
    input.engineeringIntelligence?.diagnosis?.rootCause,
    input.workspaceTests?.stderr,
    input.workspaceTests?.stdout,
    input.interactions?.error,
    ...(input.interactions?.checks || []).filter(x => !x.passed).map(x => x.error),
    ...(input.browserVerification?.consoleErrors || []),
    ...(input.browserVerification?.pageErrors || [])
  ].filter(Boolean).join("\n").toLowerCase();
}

function inferRole(file) {
  if (/\.html$/.test(file)) return "ui";
  if (/server|api|route|index/.test(file)) return "runtime-api";
  if (/model|data|db|store/.test(file)) return "data";
  return "module";
}

export function identifyArchitectureScope(codeUnderstanding = {}, input = {}) {
  const connected = codeUnderstanding.report?.connectedFiles || [];
  const edges = codeUnderstanding.report?.dependencyEdges || [];
  const scope = connected.length > 1 || edges.length > 1 ? "multi-file" : "single-file";
  return {
    scope,
    connectedFiles: connected.map(x => typeof x === "string" ? x : x.file),
    dependencyEdges: edges,
    failure: failureText(input)
  };
}

export function generateArchitectureRepairPlan(evidence = {}) {
  const files = evidence.connectedFiles || [];
  const text = evidence.failure || "";
  const patches = [];

  for (const file of files) {
    if (!safePath(file) || protectedPath(file)) continue;
    if (text.includes("health") || text.includes("broken-health")) {
      patches.push({
        id: "architecture-health-contract",
        path: file,
        operation: "replace",
        before: "/broken-health",
        after: "/health",
        reason: "Restore the health contract at the connected source layer.",
        layer: inferRole(file),
        confidence: 0.9
      });
    }
    if (text.includes("api") || text.includes("endpoint") || text.includes("route") || text.includes("404") || text.includes("500")) {
      patches.push({
        id: "architecture-api-contract",
        path: file,
        operation: "replace",
        before: "/broken-api",
        after: "/api/capabilities",
        reason: "Restore the API contract at the connected source layer.",
        layer: inferRole(file),
        confidence: 0.82
      });
    }
  }

  const unique = [];
  for (const patch of patches) {
    if (!unique.some(x => x.path === patch.path && x.before === patch.before)) unique.push(patch);
  }

  return {
    version: VERSION,
    strategy: unique.length > 1 ? "multi-file-contract-repair" : unique.length === 1 ? "single-file-contract-repair" : "evidence-only",
    scope: files.length > 1 ? "multi-file" : "single-file",
    patches: unique,
    steps: unique.length ? [
      {id:"inspect-architecture",action:"inspect-connected-source-neighborhood"},
      {id:"validate-contracts",action:"validate-cross-file-preconditions"},
      {id:"apply-transaction",action:"apply-ordered-multi-file-repair"},
      {id:"regression",action:"run-regression-gates"},
      {id:"rollback-if-needed",action:"rollback-on-regression-failure"}
    ] : [
      {id:"collect-more-evidence",action:"request-additional-architecture-evidence"}
    ],
    guardrails: [
      "Never modify tests or acceptance artifacts to manufacture a pass.",
      "Never write outside the workspace or through unsafe paths.",
      "Require exact before-content preconditions for every patch.",
      "Apply multi-file changes transactionally.",
      "Rollback every applied patch if regression verification fails.",
      "Do not promote until browser and functional gates pass."
    ]
  };
}

export function validateArchitecturePlan(plan) {
  const reasons = [];
  for (const patch of plan?.patches || []) {
    if (!safePath(patch.path)) reasons.push("unsafe path: " + patch.path);
    if (protectedPath(patch.path)) reasons.push("protected path: " + patch.path);
    if (patch.operation !== "replace") reasons.push("unsupported operation: " + patch.operation);
    if (!patch.before || typeof patch.before !== "string") reasons.push("missing precondition: " + patch.path);
    if (typeof patch.after !== "string") reasons.push("missing replacement: " + patch.path);
    if (patch.before === patch.after) reasons.push("no-op patch: " + patch.path);
  }
  return {valid: reasons.length === 0, reasons};
}

export async function applyArchitectureTransaction(root, plan, {runTests} = {}) {
  const validation = validateArchitecturePlan(plan);
  if (!validation.valid) return {status:"REJECTED", applied:[], rollback:[], validation};

  const originals = new Map();
  const applied = [];

  try {
    for (const patch of plan.patches) {
      const current = await readSource(root, patch.path);
      if (!current.includes(patch.before)) continue;
      if (!originals.has(patch.path)) originals.set(patch.path, current);
      const next = current.replace(patch.before, patch.after);
      if (next === current) throw new Error("patch produced no change: " + patch.path);
      if (next === current) throw new Error("patch produced no change: " + patch.path);
      await fs.writeFile(path.join(root, patch.path), next, "utf8");
    if (!applied.length) throw new Error("no architecture patch preconditions were satisfied");

    if (typeof runTests === "function") {
    }

    if (!applied.length) throw new Error("no architecture patch preconditions were satisfied");\n\n    if (typeof runTests === "function") {
      const tests = await runTests(root);
      if (!tests?.passed) throw new Error("regression failed after architecture repair");
      return {status:"APPLIED",applied,rollback:[],validation,tests};
    }

    return {status:"APPLIED",applied,rollback:[],validation};
  } catch (error) {
    const rollback = [];
    for (const [file, content] of originals.entries()) {
      await fs.writeFile(path.join(root, file), content, "utf8");
      rollback.push(file);
    }
    return {status:"ROLLED_BACK",applied:[],rollback,validation,error:error.message};
  }
}

export async function runArchitectureReasoningLoop(root, input = {}) {
  const scope = identifyArchitectureScope(input.codeUnderstanding, input);
  const plan = generateArchitectureRepairPlan(scope);
  if (!plan.patches.length) {
    return {version:VERSION,status:"NO_SAFE_REPAIR",repaired:false,scope,plan,attempts:0};
  }
  const transaction = await applyArchitectureTransaction(root, plan, {runTests:input.runTests});
  return {
    version:VERSION,
    status: transaction.status === "APPLIED" ? "ARCHITECTURE_REPAIRED" :
      transaction.status === "ROLLED_BACK" ? "ARCHITECTURE_ROLLED_BACK" : "ARCHITECTURE_REJECTED",
    repaired: transaction.status === "APPLIED",
    scope,
    plan,
    transaction,
    attempts: 1
  };
}

export default {
  identifyArchitectureScope,
  generateArchitectureRepairPlan,
  validateArchitecturePlan,
  applyArchitectureTransaction,
  runArchitectureReasoningLoop
};
