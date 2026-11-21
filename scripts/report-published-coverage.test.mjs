import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {measureEnterpriseCoverage} from "./india-candidate-expansion.mjs";
function run(feed){
  const dir=mkdtempSync(join(tmpdir(),"careerops-phase12-"));
  try{
    const file=join(dir,"jobs.json");
    writeFileSync(file,JSON.stringify(feed));
    return spawnSync(process.execPath,["scripts/report-published-coverage.mjs",file],
      {encoding:"utf8",env:{...process.env,GITHUB_STEP_SUMMARY:""}});
  }finally{rmSync(dir,{recursive:true,force:true});}
}
const jobs=[
  {url:"https://jobs.example.org/1",company:"Microsoft",title:"Graduate Trainee",
    location:"Hyderabad, India"},
  {url:"https://jobs.example.org/2",company:"IBM",title:"Software Engineer",
    description:"No prior experience required",location:"Pune, India"},
  {url:"https://jobs.example.org/3",company:"Other Company",title:"Senior Architect",
    description:"Minimum 8 years experience",location:"India"}
];
const feed=()=>({market:"IN",jobs,scan:{india_only:true,candidate_discovery:{
  enterprise_coverage:measureEnterpriseCoverage(jobs)}}});
test("summary counts only published MNC vacancies and entry evidence",()=>{
  const out=run(feed());
  assert.equal(out.status,0,out.stderr);
  assert.match(out.stdout,/Directory MNCs with published jobs \| 2 \/ 13/);
  assert.match(out.stdout,/Explicit zero-experience signals \| 1/);
  assert.match(out.stdout,/Microsoft \| 1 \| 1 \| 0/);
  assert.doesNotMatch(out.stdout,/Other Company \|/);
});
test("stale or fabricated enterprise totals fail closed",()=>{
  const bad=feed();bad.scan.candidate_discovery.enterprise_coverage.published_jobs=99;
  const out=run(bad);
  assert.notEqual(out.status,0);
  assert.match(out.stderr,/evidence mismatch/);
});
test("duplicate published cards cannot inflate coverage",()=>{
  const bad=feed();bad.jobs=[...jobs,jobs[0]];
  const out=run(bad);
  assert.notEqual(out.status,0);
  assert.match(out.stderr,/duplicate/);
});
test("non-India or empty feeds cannot produce credible coverage reports",()=>{
  for(const bad of [{...feed(),market:"GLOBAL"}, {...feed(),jobs:[]}]){
    const out=run(bad);assert.notEqual(out.status,0);
  }
});
