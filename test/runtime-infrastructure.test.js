import test from "node:test";
import assert from "node:assert/strict";
import {CommandRunner,DockerSandbox,LocalGitRepository,ProductionEvaluator,ChampionStore,JoraRuntime} from "../src/index.js";

test("command runner executes bounded commands", async()=> {
  const runner=new CommandRunner({timeoutMs:5000});
  const r=await runner.run(process.execPath,["-e","console.log('ok')"]);
  assert.equal(r.ok,true); assert.match(r.stdout,/ok/);
});

test("docker sandbox constructs isolated execution boundary", async()=> {
  const calls=[];
  const runner={run:async(command,args)=>{calls.push({command,args}); return {ok:true};}};
  const sandbox=new DockerSandbox({runner});
  await sandbox.run({cwd:"/workspace/project",command:"npm",commandArgs:["test"]});
  assert.equal(calls[0].command,"docker");
  assert.ok(calls[0].args.includes("--network") && calls[0].args.includes("none"));
  assert.ok(calls[0].args.includes("--cap-drop") && calls[0].args.includes("ALL"));
});

test("local git adapter delegates commit and rollback", async()=> {
  const calls=[];
  const runner={run:async(command,args)=>{calls.push([command,args]); return {ok:true,stdout:"abc\n",stderr:""};}};
  const git=new LocalGitRepository({root:"/tmp/jora",runner});
  assert.equal(await git.branch(),"abc");
  await git.commit("test");
  await git.rollback("HEAD~1");
  assert.ok(calls.some(x=>x[1][0]==="reset"));
});

test("production evaluator records benchmark evidence", async()=> {
  const records=[];
  const evaluator=new ProductionEvaluator({
    testRunner:async()=>({ok:true}),
    securityCouncil:{review:async()=>({passed:true})},
    benchmarkStore:{record:r=>records.push(r)}
  });
  const result=await evaluator.evaluate({project:{id:"p1"}});
  assert.equal(result.productionReady,true); assert.equal(records.length,1);
});

test("champion store promotes and rolls back",()=> {
  const store=new ChampionStore();
  store.promote("v1",{score:1}); store.promote("v2",{score:2});
  assert.equal(store.get(),"v2"); assert.equal(store.rollback(),"v1");
});

test("Jora runtime creates an isolated candidate before each execution",async()=> {
  const calls=[];
  const runtime=new JoraRuntime({
    builder:{build:async x=>{calls.push(["build",x.context.candidate.branch]);return {project:{id:"candidate"}};}},
    controller:{run:async x=>{calls.push(["run",x.context.built.project.id]);return {status:"PROMOTED"};},stop(){}},
    repository:{baseBranch:"main",prepareCandidate:async id=>({branch:"jora/candidate-"+id,base:"base-sha"})}
  });
  const result=await runtime.execute({command:"build agent",context:{taskId:"t1"}});
  assert.equal(result.status,"PROMOTED");
  assert.equal(calls[0][0],"build");
  assert.match(calls[0][1],/^jora\/candidate-t1$/);
});

test("Jora runtime connects build and autonomous controller",async()=> {
  const calls=[];
  const runtime=new JoraRuntime({
    builder:{build:async x=>{calls.push(["build",x.command]); return {project:{id:"p"}};}},
    controller:{run:async x=>{calls.push(["run",x.command]); return {status:"PROMOTED"};},stop(){}}
  });
  const result=await runtime.execute({command:"build agent"});
  assert.equal(result.status,"PROMOTED"); assert.deepEqual(calls,[["build","build agent"],["run","build agent"]]);
});
