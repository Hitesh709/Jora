import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {JoraNativeProvider} from "../src/core/jora-native-provider.js";
import {ModelProjectBuilder} from "../src/core/model-project-builder.js";

class MemoryRepository {
  constructor(root){this.root=root;}
  async write(filePath,content){
    const target=path.join(this.root,filePath);
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,content,"utf8");
    return {path:filePath,status:"WRITTEN"};
  }
}

async function runGeneratedTests(root){
  const {spawn}=await import("node:child_process");
  return await new Promise((resolve)=>{
    const child=spawn(process.execPath,["--test","test/index.test.js"],{cwd:root,stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";
    child.stdout.on("data",x=>stdout+=x);
    child.stderr.on("data",x=>stderr+=x);
    child.on("close",code=>resolve({ok:code===0,code,stdout,stderr}));
  });
}

test("Jora autonomously generates, tests, detects failure, repairs, and passes again",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"jora-native-"));
  try{
    const provider=new JoraNativeProvider();
    const repository=new MemoryRepository(root);
    const builder=new ModelProjectBuilder({modelGateway:provider,repository});
    const command="Build a small REST API with a health endpoint and browser status page";

    const first=await builder.build({command,context:{cycle:1}});
    assert.equal(first.status,"SUCCEEDED");
    assert.ok(first.files.length>=5);

    const initial=await runGeneratedTests(root);
    assert.equal(initial.ok,true,initial.stderr||initial.stdout);

    const testPath=path.join(root,"test/index.test.js");
    const originalTest=await fs.readFile(testPath,"utf8");
    const brokenTest=originalTest.replace(
      'assert.equal(body.engine,"jora-native");',
      'assert.equal(body.engine,"jora-native");\n  assert.equal(1,2);'
    );
    assert.notEqual(brokenTest,originalTest);
    await fs.writeFile(testPath,brokenTest,"utf8");

    const broken=await runGeneratedTests(root);
    assert.equal(broken.ok,false);

    const repaired=await builder.build({
      command,
      context:{
        cycle:2,
        repairFeedback:{
          diagnosis:"The generated acceptance test was intentionally corrupted and no longer passes.",
          hypothesis:"Regenerate the complete runnable project files and restore the valid acceptance test."
        },
        repairHistory:[{cycle:1,status:"FAILED",error:"generated acceptance test failure"}]
      }
    });
    assert.equal(repaired.status,"SUCCEEDED");
    assert.equal(repaired.repairCycle,true);

    const final=await runGeneratedTests(root);
    assert.equal(final.ok,true,final.stderr||final.stdout);

    assert.ok(repaired.files.some(x=>x.path==="src/index.js"));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
