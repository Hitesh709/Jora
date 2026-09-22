import fs from "node:fs/promises";
import path from "node:path";

function normalize(value){
  return String(value||"").toLowerCase();
}

function unique(items){
  return [...new Set(items.filter(Boolean))];
}

export function collectEngineeringEvidence({
  command,
  blueprint,
  generation,
  workspaceTests,
  browserVerification,
  interactions,
  repairHistory=[],
  learning
}={}){
  const failures=[];
  if(workspaceTests&&!workspaceTests.passed) failures.push({
    layer:"workspace",
    type:"test-failure",
    summary:workspaceTests.stderr||workspaceTests.stdout||"Workspace tests failed."
  });
  if(browserVerification&&browserVerification.status!=="BROWSER_VERIFIED") failures.push({
    layer:"browser",
    type:"browser-verification",
    summary:browserVerification.reason||browserVerification.error||"Browser verification failed."
  });
  for(const check of interactions?.checks||[]){
    if(!check.passed) failures.push({
      layer:"interaction",
      type:"interaction-failure",
      scenario:check.name,
      summary:check.error||"Interaction failed."
    });
  }
  for(const error of interactions?.consoleErrors||[]) failures.push({
    layer:"runtime",
    type:"console-error",
    summary:error
  });
  for(const error of interactions?.pageErrors||[]) failures.push({
    layer:"runtime",
    type:"page-error",
    summary:error
  });

  const files=unique([
    ...(generation?.files||[]).map(x=>x.path),
    ...(generation?.taskMap||[]).flatMap(x=>x.outputs||[])
  ]);

  const tasks=(generation?.taskMap||[]).map(task=>({
    taskId:task.taskId,
    title:task.title,
    type:task.type,
    outputs:task.outputs||[]
  }));

  return {
    version:"1.0",
    command:String(command||""),
    product:blueprint?.product||null,
    requirements:blueprint?.requirements||null,
    files,
    tasks,
    failures,
    repairHistory:repairHistory.slice(-10),
    learningSummary:{
      cycles:learning?.cycles||0,
      strategies:Object.keys(learning?.strategies||{}).length,
      recentOutcomes:(learning?.outcomes||[]).slice(-5)
    }
  };
}

export function diagnoseEngineeringState(evidence){
  const failures=evidence?.failures||[];
  const joined=normalize(failures.map(x=>x.summary).join(" "));
  let rootCause="unknown";
  let confidence=0.4;
  let repairMode="targeted";
  let affectedLayer="unknown";

  if(!failures.length){
    return {
      status:"HEALTHY",
      rootCause:"No observed failure.",
      confidence:1,
      repairMode:"none",
      affectedLayer:"none",
      rationale:["All supplied verification evidence is passing."]
    };
  }

  if(/no .*interactive|locator|timeout.*locator|expected text|click|fill|search|password|email/.test(joined)){
    rootCause="ui-contract-or-interaction-mismatch";
    confidence=0.82;
    repairMode="browser-targeted";
    affectedLayer="ui";
  }else if(/syntaxerror|unexpected token|cannot find module|referenceerror|is not defined/.test(joined)){
    rootCause="source-code-defect";
    confidence=0.9;
    repairMode="source-targeted";
    affectedLayer="code";
  }else if(/health|econnrefused|listen|address already in use/.test(joined)){
    rootCause="runtime-or-server-contract";
    confidence=0.86;
    repairMode="runtime-targeted";
    affectedLayer="runtime";
  }else if(/api|endpoint|fetch|404|500/.test(joined)){
    rootCause="api-contract-mismatch";
    confidence=0.72;
    repairMode="source-targeted";
    affectedLayer="api";
  }else{
    repairMode="evidence-driven";
  }

  const taskHints=[];
  for(const failure of failures){
    const scenario=normalize(failure.scenario||failure.summary);
    if(scenario.includes("search")) taskHints.push("05-screens","06-flows");
    if(scenario.includes("sign-in")||scenario.includes("auth")) taskHints.push("02-auth","05-screens");
    if(scenario.includes("booking")) taskHints.push("06-flows","07-api");
    if(scenario.includes("checkout")) taskHints.push("06-flows","07-api","08-integrations");
    if(scenario.includes("game")) taskHints.push("09-gameplay");
  }

  return {
    status:"DEGRADED",
    rootCause,
    confidence,
    repairMode,
    affectedLayer,
    candidateTasks:unique(taskHints),
    rationale:[
      "Diagnosis is derived from observed verification evidence.",
      `Detected ${failures.length} failure signal(s).`,
      `Selected ${repairMode} repair mode for the affected ${affectedLayer} layer.`
    ]
  };
}

export function buildEngineeringPlan(evidence,diagnosis){
  if(diagnosis?.status==="HEALTHY") return {
    strategy:"no-repair",
    steps:[{id:"verify",action:"preserve",reason:"All evidence is passing."}]
  };

  const steps=[];
  if(diagnosis?.repairMode==="browser-targeted") steps.push(
    {id:"browser-diagnosis",action:"inspect-interaction-evidence"},
    {id:"browser-repair",action:"apply-minimal-ui-repair"},
    {id:"browser-regression",action:"restart-and-retest"}
  );
  else if(diagnosis?.repairMode==="source-targeted") steps.push(
    {id:"source-diagnosis",action:"map-failure-to-task-and-file"},
    {id:"source-repair",action:"apply-minimal-source-repair"},
    {id:"source-regression",action:"run-workspace-tests-and-browser-tests"}
  );
  else steps.push(
    {id:"evidence-expansion",action:"collect-additional-runtime-evidence"},
    {id:"targeted-repair",action:"apply-smallest-safe-repair"},
    {id:"regression",action:"rerun-all-gates"}
  );

  return {
    strategy:diagnosis?.repairMode||"evidence-driven",
    confidence:diagnosis?.confidence||0,
    candidateTasks:diagnosis?.candidateTasks||[],
    steps,
    guardrails:[
      "Never weaken an acceptance test merely to obtain a pass.",
      "Prefer the smallest source change that addresses observed evidence.",
      "Re-run lower-level and browser gates after every repair cycle.",
      "Do not promote unless all required gates pass."
    ]
  };
}

export async function persistEngineeringReport(root,report){
  const target=path.join(root,".jora","engineering-report.json");
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,JSON.stringify(report,null,2)+"\n","utf8");
  return target;
}

export function runEngineeringIntelligence(input={}){
  const evidence=collectEngineeringEvidence(input);
  const diagnosis=diagnoseEngineeringState(evidence);
  const plan=buildEngineeringPlan(evidence,diagnosis);
  return {
    version:"1.0",
    status:diagnosis.status,
    evidence,
    diagnosis,
    plan,
    generatedAt:new Date().toISOString()
  };
}
