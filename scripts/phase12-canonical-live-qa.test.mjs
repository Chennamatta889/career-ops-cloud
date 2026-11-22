import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(".github/workflows/browser-live-qa.yml","utf8");
const smoke=readFileSync("scripts/browser-live-smoke.mjs","utf8");
test("Phase 12 browser QA targets the canonical root Pages site",()=>{
  assert.match(workflow,/CAREEROPS_LIVE_ORIGIN: https:\/\/chennamatta889\.github\.io\s*$/m);
  assert.match(smoke,/process\.env\.CAREEROPS_LIVE_ORIGIN\|\|"https:\/\/chennamatta889\.github\.io"/);
  assert.doesNotMatch(workflow,/chennamatta889\.github\.io\/career-ops-cloud/);
});
test("disabled project deployment cannot automatically trigger stale live QA",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/workflow_run:/);
  assert.match(workflow,/node scripts\/browser-live-smoke\.mjs/);
});
