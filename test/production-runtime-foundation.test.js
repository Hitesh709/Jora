import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {WorkspaceRepository,createWorkspaceSecurityCouncil} from "../src/index.js";

test("workspace repository isolates paths and security council scans generated files",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"jora-workspace-"));
  const repository=new WorkspaceRepository({root});
  const candidate=await repository.prepareCandidate("test");
  assert.match(candidate.branch,/^jora\/candidate-test$/);
  await repository.write("package.json",JSON.stringify({name:"candidate",scripts:{test:"node --version"}}));
  const security=await createWorkspaceSecurityCouncil({repository}).review();
  assert.equal(security.passed,true);
  await assert.rejects(()=>repository.write("../escape.txt","bad"),/path escapes workspace/);
});

test("security council blocks embedded secrets",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"jora-security-"));
  const repository=new WorkspaceRepository({root});
  await repository.prepareCandidate("secret");
  await repository.write("config.js",'export const apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456";');
  const security=await createWorkspaceSecurityCouncil({repository}).review();
  assert.equal(security.passed,false);
  assert.equal(security.reports[0].passed,false);
});
