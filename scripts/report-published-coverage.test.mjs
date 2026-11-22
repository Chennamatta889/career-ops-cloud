import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {measureEnterpriseCoverage} from "./india-candidate-expansion.mjs";
function run(feed){
  const dir=mkdtempSync(join(tmpdir(),"careerops-phase12-"));
  try{
    const file=join(dir,"jobs.json");
    writeFileSync(file,JSON.stringify(feed));
    const output=join(dir,"coverage.json");
    const result=spawnSync(process.execPath,["scripts/report-published-coverage.mjs",file],
      {encoding:"utf8",env:{...process.env,GITHUB_STEP_SUMMARY:"",COVERAGE_OUTPUT:output}});
    return {...result,evidence:existsSync(output)?JSON.parse(readFileSync(output,"utf8")):null};
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

test("public evidence is derived from final unique published cards",()=>{
  const result=run(feed());
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.evidence.schema,"careerops.coverage-evidence.v1");
  assert.equal(result.evidence.market,"IN");
  assert.equal(result.evidence.published_jobs,3);
  assert.equal(result.evidence.entry_signals,2);
  assert.equal(result.evidence.explicit_zero_experience,1);
  assert.equal(result.evidence.enterprise_coverage.employers_with_published_jobs,2);
  assert.equal(result.evidence.source_feed,"data/jobs.json");
  assert.ok(!JSON.stringify(result.evidence).includes("No prior experience required"));
});
test("invalid coverage does not emit public evidence",()=>{
  const bad=feed();bad.scan.candidate_discovery.enterprise_coverage.published_jobs=200;
  const result=run(bad);
  assert.notEqual(result.status,0);
  assert.equal(result.evidence,null);
});

test("role-family evidence reflects only published titles and explicit experience",()=>{
  const sample=[
    {url:"https://jobs.example.org/dotnet",company:"A",title:".NET Developer",
      requiredExperience:"3–5 years",location:"India"},
    {url:"https://jobs.example.org/java",company:"B",title:"Java Spring Boot Engineer",
      requiredExperience:"0–2 years",location:"India"},
    {url:"https://jobs.example.org/qa",company:"C",title:"Manual Tester",
      location:"India"},
    {url:"https://jobs.example.org/unrelated",company:"D",title:"Sales Executive",
      description:"Works with Java engineers",location:"India"}
  ];
  const input={market:"IN",jobs:sample,scan:{india_only:true,candidate_discovery:{
    enterprise_coverage:measureEnterpriseCoverage(sample)}}};
  const result=run(input);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.evidence.role_coverage.dotnet.jobs,1);
  assert.equal(result.evidence.role_coverage.dotnet.three_to_five_years,1);
  assert.equal(result.evidence.role_coverage.java.jobs,1);
  assert.equal(result.evidence.role_coverage.java.fresher_to_two_years,1);
  assert.equal(result.evidence.role_coverage.testing.jobs,1);
  assert.equal(result.evidence.role_coverage.testing.experience_unspecified,1);
  assert.match(result.stdout,/Verified technology-role coverage/);
});
