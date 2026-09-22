import fs from "node:fs/promises";
import path from "node:path";

const VERSION = "1.0";
const PROTECTED_TEST_PATHS = new Set([
  "test",
  ".jora/acceptance.json",
  ".jora/requirements.json",
  ".jora/engineering-report.json"
]);

function clean(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePath(filePath = "") {
  return String(filePath).replace(/\\/g, "/").replace(/^\.\//, "");
}

function isSafeRelativePath(filePath) {
  const normalized = normalizePath(filePath);
  return Boolean(
    normalized &&
    !normalized.startsWith("/") &&
    !normalized.includes("\0") &&
    !normalized.split("/").includes("..") &&
    !normalized.startsWith(".git/") &&
    !normalized.startsWith("node_modules/")
  );
}

function isProtectedPath(filePath) {
  const normalized = normalizePath(filePath);
  return [...PROTECTED_TEST_PATHS].some(prefix =>
    normalized === prefix || normalized.startsWith(prefix + "/")
  );
}

async function walk(root, current = root, result = []) {
  const entries = await fs.readdir(current, {withFileTypes: true});
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, result);
    else result.push(normalizePath(path.relative(root, absolute)));
  }
  return result;
}

async function readText(root, relativePath) {
  if (!isSafeRelativePath(relativePath)) throw new Error("unsafe source path: " + relativePath);
  return fs.readFile(path.join(root, relativePath), "utf8");
}

function failureText(input = {}) {
  const parts = [
    input.engineeringIntelligence?.diagnosis?.rootCause,
    input.engineeringIntelligence?.diagnosis?.repairMode,
    input.workspaceTests?.stderr,
    input.workspaceTests?.stdout,
    input.interactions?.error,
    ...(input.interactions?.checks || []).filter(x => !x.passed).map(x => x.error),
    ...(input.browserVerification?.consoleErrors || []),
    ...(input.browserVerification?.pageErrors || [])
  ];
  return parts.filter(Boolean).join("\n").toLowerCase();
}

export async function collectCodeEvidence(root, input = {}) {
  const files = await walk(root);
  const sourceFiles = files.filter(file => /\.(js|mjs|cjs|ts|tsx|jsx|html|css|json)$/.test(file));
  const contents = [];
  for (const file of sourceFiles.slice(0, 80)) {
    try {
      const content = await readText(root, file);
      contents.push({
        path: file,
        bytes: Buffer.byteLength(content),
        lines: content.split("\n").length,
        content
      });
    } catch {
      // Ignore files that disappear during a repair cycle.
    }
  }
  return {
    version: VERSION,
    root,
    files: contents.map(({path: file, bytes, lines}) => ({path: file, bytes, lines})),
    source: contents,
    failureText: failureText(input),
    diagnosis: input.engineeringIntelligence?.diagnosis || null,
    generationTasks: input.generation?.taskMap || [],
    acceptanceCriteria: input.blueprint?.acceptanceCriteria || input.blueprint?.projectBlueprint?.acceptanceCriteria || []
  };
}

export function mapFailureToSource(evidence) {
  const text = clean(evidence.failureText).toLowerCase();
  const diagnosis = evidence.diagnosis || {};
  const candidates = [];

  const add = (file, reason, confidence = 0.7, taskId = null) => {
    if (!isSafeRelativePath(file) || isProtectedPath(file)) return;
    if (!candidates.some(x => x.file === file)) candidates.push({file, reason, confidence, taskId});
  };

  if (/broken-health|health.*(?:fail|missing)|(?:fail|missing).*health|eaddrinuse|listen/.test(text)) {
    add("src/index.js", "The runtime/health evidence points to the generated server contract.", 0.94, "10-verify");
  }
  if (/referenceerror|syntaxerror|module not found|cannot find module|import .* failed|unexpected token/.test(text)) {
    const named = evidence.source.find(x =>
      /src\/.*\.(js|mjs|cjs|ts|tsx|jsx)$/.test(x.path)
    );
    if (named) add(named.path, "The failure is a source-level runtime or module error.", 0.9, "11-repair");
  }
  if (/api|fetch|404|500|endpoint|route/.test(text)) {
    add("src/index.js", "API/route evidence maps to the generated server contract.", 0.78, "07-api");
  }
  if (/search|input|selector|button|click|fill/.test(text)) {
    add("src/index.html", "Interaction evidence maps to the generated UI contract.", 0.76, "05-screens");
  }

  if (!candidates.length && diagnosis?.candidateTasks?.length) {
    const preferred = diagnosis.candidateTasks.includes("07-api") ? "src/index.js" :
      diagnosis.candidateTasks.includes("05-screens") ? "src/index.html" : null;
    if (preferred) add(preferred, "Engineering diagnosis supplied a candidate implementation layer.", 0.62, diagnosis.candidateTasks[0]);
  }

  return {
    status: candidates.length ? "MAPPED" : "UNMAPPED",
    candidates: candidates.sort((a, b) => b.confidence - a.confidence)
  };
}

function candidatePatchFor(file, content, evidence) {
  const text = evidence.failureText;
  const patches = [];

  if (file === "src/index.js" && content.includes("/broken-health") && /health|broken-health/.test(text)) {
    const before = "/broken-health";
    patches.push({
      id: "repair-health-route",
      path: file,
      operation: "replace",
      before,
      after: "/health",
      reason: "Restore the required health endpoint without changing unrelated server behavior.",
      taskId: "10-verify"
    });
  }

  if (file === "src/index.js" && /(?:referenceerror|syntaxerror|module not found)/.test(text)) {
    const importMatch = text.match(/cannot find module ['"]([^'"]+)['"]/);
    if (importMatch && content.includes(importMatch[1])) {
      // A referenced import path is present, but no broad source rewrite is safe without
      // a precise failing line. Leave this case for a later reasoning cycle.
    }
  }

  if (file === "src/index.js" && /api|endpoint|route/.test(text) && content.includes("/broken-api")) {
    patches.push({
      id: "repair-api-route",
      path: file,
      operation: "replace",
      before: "/broken-api",
      after: "/api/capabilities",
      reason: "Restore the generated capabilities API contract while preserving the existing route handler.",
      taskId: "07-api"
    });
  }

  return patches;
}

export function generateSourceRepairCandidates(evidence, mapping = mapFailureToSource(evidence)) {
  const candidates = [];
  for (const target of mapping.candidates) {
    const file = evidence.source.find(item => item.path === target.file);
    if (!file) continue;
    for (const patch of candidatePatchFor(target.file, file.content, evidence)) {
      candidates.push({
        ...patch,
        confidence: target.confidence,
        diagnosis: evidence.diagnosis?.rootCause || "evidence-driven"
      });
    }
  }
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export function validateRepairPatch(patch, evidence) {
  const reasons = [];
  if (!patch || !isSafeRelativePath(patch.path)) reasons.push("unsafe path");
  if (isProtectedPath(patch?.path)) reasons.push("protected file");
  if (patch?.operation !== "replace") reasons.push("unsupported patch operation");
  if (!patch?.before || typeof patch.before !== "string") reasons.push("missing exact precondition");
  if (typeof patch?.after !== "string") reasons.push("missing replacement");
  const file = evidence.source.find(item => item.path === patch?.path);
  if (!file) reasons.push("target file not found");
  if (file && patch?.before && !file.content.includes(patch.before)) reasons.push("precondition not satisfied");
  if (patch?.before && patch?.after && patch.before === patch.after) reasons.push("no-op patch");
  if (patch?.path && isProtectedPath(patch.path)) reasons.push("patch would weaken protected acceptance artifacts");
  return {valid: reasons.length === 0, reasons};
}

export async function applySourceRepair(root, patch, evidence) {
  const validation = validateRepairPatch(patch, evidence);
  if (!validation.valid) return {applied: false, validation, patch};

  const current = await readText(root, patch.path);
  if (!current.includes(patch.before)) {
    return {applied: false, validation: {valid: false, reasons: ["precondition changed before write"]}, patch};
  }

  const next = current.replace(patch.before, patch.after);
  if (next === current) {
    return {applied: false, validation: {valid: false, reasons: ["patch produced no change"]}, patch};
  }

  await fs.writeFile(path.join(root, patch.path), next, "utf8");
  return {
    applied: true,
    patch,
    validation,
    changed: {path: patch.path, before: patch.before, after: patch.after}
  };
}

export function buildCodeReasoningPlan(evidence, mapping, candidates) {
  const sourceRepair = candidates[0] || null;
  return {
    version: VERSION,
    strategy: sourceRepair ? "minimal-source-repair" : "no-safe-source-repair",
    rootCause: evidence.diagnosis?.rootCause || "evidence-driven",
    target: mapping.candidates[0] || null,
    candidateCount: candidates.length,
    steps: sourceRepair ? [
      {id: "inspect-source", action: "inspect-source-context"},
      {id: "validate-patch", action: "validate-exact-precondition"},
      {id: "apply-patch", action: "apply-minimal-source-repair"},
      {id: "regression", action: "rerun-workspace-and-browser-gates"}
    ] : [
      {id: "inspect-source", action: "inspect-source-context"},
      {id: "escalate", action: "request-additional-evidence"}
    ],
    guardrails: [
      "Never modify protected tests or acceptance artifacts to manufacture a pass.",
      "Never write outside the project workspace or through a path containing '..'.",
      "Every patch must have an exact before-content precondition.",
      "Prefer one minimal source change over broad rewrites.",
      "Re-run regression gates after every accepted source repair.",
      "Do not promote until required verification gates pass."
    ]
  };
}

export async function runCodeReasoningRepairLoop(root, input = {}) {
  const maxAttempts = Math.max(1, Number(input.maxAttempts || 1));
  const history = [];
  let currentInput = {...input};

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const evidence = await collectCodeEvidence(root, currentInput);
    const mapping = mapFailureToSource(evidence);
    const candidates = generateSourceRepairCandidates(evidence, mapping);
    const plan = buildCodeReasoningPlan(evidence, mapping, candidates);

    if (!candidates.length) {
      return {version: VERSION, status: "NO_SAFE_REPAIR", repaired: false, attempts: attempt - 1, evidence, mapping, plan, history};
    }

    const applied = await applySourceRepair(root, candidates[0], evidence);
    history.push({attempt, mapping, plan, applied});
    if (!applied.applied) {
      return {version: VERSION, status: "PATCH_REJECTED", repaired: false, attempts: attempt, evidence, mapping, plan, history};
    }

    if (typeof input.runTests !== "function") {
      return {version: VERSION, status: "SOURCE_REPAIRED", repaired: true, attempts: attempt, evidence, mapping, plan, history};
    }

    const tests = await input.runTests(root);
    currentInput = {...currentInput, workspaceTests: tests};
    if (tests.passed) {
      return {version: VERSION, status: "SOURCE_REPAIRED", repaired: true, attempts: attempt, tests, evidence, mapping, plan, history};
    }
  }

  return {version: VERSION, status: "REPAIR_EXHAUSTED", repaired: false, attempts: maxAttempts, history};
}

export default {
  collectCodeEvidence,
  mapFailureToSource,
  generateSourceRepairCandidates,
  validateRepairPatch,
  applySourceRepair,
  buildCodeReasoningPlan,
  runCodeReasoningRepairLoop
};
