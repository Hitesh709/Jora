import fs from "node:fs/promises";
import path from "node:path";

const VERSION = "1.0";
const SOURCE_EXTENSIONS = /\.(js|mjs|cjs|ts|tsx|jsx)$/;
const PROTECTED = ["test/", ".jora/acceptance.json", ".jora/requirements.json"];

function normalize(filePath = "") {
  return String(filePath).replace(/\\/g, "/").replace(/^\.\//, "");
}

function safe(filePath) {
  const p = normalize(filePath);
  return Boolean(p && !p.startsWith("/") && !p.split("/").includes("..") &&
    !p.startsWith(".git/") && !p.startsWith("node_modules/"));
}

function protectedPath(filePath) {
  const p = normalize(filePath);
  return PROTECTED.some(prefix => p === prefix || p.startsWith(prefix));
}

async function walk(root, current = root, result = []) {
  for (const entry of await fs.readdir(current, {withFileTypes:true})) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) await walk(root, abs, result);
    else result.push(normalize(path.relative(root, abs)));
  }
  return result;
}

function extractImports(content) {
  const refs = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /import\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(content))) refs.push(match[1]);
  }
  return [...new Set(refs)];
}

function resolveImport(from, ref, files) {
  if (!ref.startsWith(".")) return null;
  const base = normalize(path.posix.join(path.posix.dirname(from), ref));
  const candidates = [base, base + ".js", base + ".mjs", base + ".cjs", base + ".ts", base + ".tsx", base + "/index.js"];
  return candidates.find(x => files.has(x)) || null;
}

function errorText(input = {}) {
  return [
    input.workspaceTests?.stderr,
    input.workspaceTests?.stdout,
    input.engineeringIntelligence?.diagnosis?.rootCause,
    input.interactions?.error,
    ...(input.interactions?.checks || []).filter(x => !x.passed).map(x => x.error),
    ...(input.browserVerification?.consoleErrors || []),
    ...(input.browserVerification?.pageErrors || [])
  ].filter(Boolean).join("\n").toLowerCase();
}

export async function buildCodeDependencyGraph(root, {maxFiles=120} = {}) {
  const all = (await walk(root)).filter(x => SOURCE_EXTENSIONS.test(x)).slice(0, maxFiles);
  const fileSet = new Set(all);
  const nodes = [];
  const edges = [];

  for (const file of all) {
    let content = "";
    try { content = await fs.readFile(path.join(root, file), "utf8"); } catch { continue; }
    const imports = extractImports(content);
    const resolved = imports.map(ref => ({ref, file:resolveImport(file, ref, fileSet)}));
    nodes.push({
      path:file,
      lines:content.split("\n").length,
      imports:resolved.filter(x=>x.file).map(x=>x.file),
      externalImports:resolved.filter(x=>!x.file && !x.ref.startsWith(".")).map(x=>x.ref)
    });
    for (const item of resolved) if (item.file) edges.push({from:file,to:item.file,type:"import"});
  }

  return {version:VERSION,root,nodes,edges};
}

export function rankDependencyNeighborhood(graph, targets = []) {
  const targetSet = new Set(targets.map(normalize));
  const scores = new Map();
  for (const node of graph.nodes) scores.set(node.path, targetSet.has(node.path) ? 1 : 0);

  for (const edge of graph.edges) {
    if (targetSet.has(edge.from) || targetSet.has(edge.to)) {
      scores.set(edge.from, (scores.get(edge.from)||0) + (targetSet.has(edge.from) ? 0.35 : 0.6));
      scores.set(edge.to, (scores.get(edge.to)||0) + (targetSet.has(edge.to) ? 0.35 : 0.6));
    }
  }
  return [...scores.entries()]
    .filter(([,score]) => score > 0)
    .sort((a,b)=>b[1]-a[1])
    .map(([file,score])=>({file,score:Number(score.toFixed(3))}));
}

export function traceFailureAcrossFiles(graph, failure, targets = []) {
  const text = String(failure || "").toLowerCase();
  const hints = [];
  if (/module not found|cannot find module|module\\s+reference|import|export|referenceerror/.test(text)) hints.push("module");
  if (/api|fetch|route|endpoint|404|500/.test(text)) hints.push("api");
  if (/search|button|input|selector|click|fill|dom/.test(text)) hints.push("ui");
  if (/health|listen|server|eaddr/.test(text)) hints.push("runtime");

  const targetPaths = [...new Set([
    ...targets.filter(safe),
    ...graph.nodes.filter(n => hints.includes("module") && n.externalImports.length === 0).slice(0,3).map(n=>n.path),
    ...graph.edges.filter(e => hints.includes("api") && /server|api|route|index/.test(e.from+" "+e.to)).flatMap(e=>[e.from,e.to]),
    ...graph.nodes.filter(n => hints.includes("ui") && /html|jsx|tsx|ui|view|component/.test(n.path)).map(n=>n.path)
  ])];

  return {
    failure,
    hints,
    targets:rankDependencyNeighborhood(graph,targetPaths).slice(0,12)
  };
}

export function buildMultiFileReasoningReport(graph, trace, evidence = {}) {
  const connected = trace.targets.map(x => x.file);
  const edges = graph.edges.filter(e => connected.includes(e.from) || connected.includes(e.to));
  const files = connected.map(file => ({
    file,
    role: file.endsWith(".html") ? "ui-entry" :
      /server|api|route|index\.js/.test(file) ? "runtime-or-api" :
      "source-module"
  }));
  return {
    version:VERSION,
    status:connected.length ? "UNDERSTOOD" : "INSUFFICIENT_EVIDENCE",
    failure:evidence.failureText || trace.failure || "",
    connectedFiles:files,
    dependencyEdges:edges,
    reasoning:{
      scope:connected.length > 1 ? "multi-file" : connected.length ? "single-or-unknown" : "unresolved",
      candidateFiles:connected,
      rationale:connected.length
        ? "Failure evidence was traced through source dependencies and related implementation layers."
        : "No sufficiently connected source neighborhood was identified."
    },
    guardrails:[
      "Do not modify tests or acceptance artifacts as a repair shortcut.",
      "Only reason over files inside the workspace.",
      "Prefer connected source neighborhoods over unrelated files.",
      "Require regression verification after multi-file changes."
    ]
  };
}

export async function collectMultiFileCodeUnderstanding(root, input = {}) {
  const graph = await buildCodeDependencyGraph(root);
  const failure = errorText(input);
  const initialTargets = [
    ...(input.codeReasoning?.mapping?.candidates || []).map(x=>x.file),
    ...(input.engineeringIntelligence?.diagnosis?.candidateFiles || [])
  ];
  const trace = traceFailureAcrossFiles(graph, failure, initialTargets);
  const report = buildMultiFileReasoningReport(graph, trace, {failureText:failure});
  return {version:VERSION,graph,trace,report};
}

export async function persistCodeUnderstandingReport(root, report) {
  await fs.mkdir(path.join(root, ".jora"), {recursive:true});
  await fs.writeFile(path.join(root, ".jora", "code-understanding.json"), JSON.stringify(report, null, 2), "utf8");
  return report;
}

export default {
  buildCodeDependencyGraph,
  rankDependencyNeighborhood,
  traceFailureAcrossFiles,
  buildMultiFileReasoningReport,
  collectMultiFileCodeUnderstanding,
  persistCodeUnderstandingReport
};
