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

test("Phase 12 release guard compares against the canonical root production feed",()=>{
  const guard=readFileSync("scripts/guard-public-feed.mjs","utf8");
  assert.match(guard,/process\.env\.PREVIOUS_PUBLIC_FEED\|\|"https:\/\/chennamatta889\.github\.io\/data\/jobs\.json"/);
  assert.doesNotMatch(guard,/chennamatta889\.github\.io\/career-ops-cloud\/data\/jobs\.json/);
  assert.match(guard,/previousIndiaCount>=100/);
});
