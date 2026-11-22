#!/usr/bin/env node
/**
 * Phase 12: independently audit the final published feed, not employer leads.
 * Exit nonzero if fresher/MNC evidence disagrees with actual deduplicated jobs.
 * Only anonymous public metadata is printed; never applicant details.
 */
import {readFileSync,appendFileSync,writeFileSync} from "node:fs";
import {measureEnterpriseCoverage} from "./india-candidate-expansion.mjs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {entryOpportunity}=require("../job-text.js");
const {measureRoleCoverage}=require("./phase12-role-coverage.cjs");
const path=process.argv[2]||"public/data/jobs.json";
const feed=JSON.parse(readFileSync(path,"utf8"));
const jobs=feed.jobs;
if(!Array.isArray(jobs)||!jobs.length||feed.market!=="IN"||feed.scan?.india_only!==true)
  throw Error("Cannot report coverage for an empty or non-India published feed");
const expected=measureEnterpriseCoverage(jobs);
const reported=feed.scan?.candidate_discovery?.enterprise_coverage;
if(!reported)throw Error("Missing published MNC coverage evidence");
const keys=["directory_companies","employers_with_published_jobs","employers_with_entry_positions",
  "published_jobs","published_entry_positions"];
for(const key of keys)
  if(reported[key]!==expected[key])
    throw Error("Published MNC evidence mismatch: "+key);
if(JSON.stringify(reported.companies)!==JSON.stringify(expected.companies))
  throw Error("Published MNC employer breakdown differs from final job feed");
const urls=new Set();
let entry=0,zero=0;
for(const job of jobs){
  if(!job||typeof job.url!=="string"||urls.has(job.url.trim().toLowerCase()))
    throw Error("Published feed contains duplicate or invalid job URLs");
  urls.add(job.url.trim().toLowerCase());
  const classification=entryOpportunity(job);
  if(["fresher","early"].includes(classification.level))entry++;
  if(classification.level==="fresher"&&classification.basis==="explicit")zero++;
}
const roleCoverage=measureRoleCoverage(jobs);
const lines=[
  "## Phase 12 verified India hiring coverage",
  "",
  "| Published-feed metric | Count |",
  "| --- | ---: |",
  "| Unique recent India job cards | "+jobs.length+" |",
  "| Fresher and early-career signals | "+entry+" |",
  "| Explicit zero-experience signals | "+zero+" |",
  "| Directory MNCs with published jobs | "+expected.employers_with_published_jobs+" / "+expected.directory_companies+" |",
  "| MNCs with entry-role signals | "+expected.employers_with_entry_positions+" |",
  "| Published MNC jobs | "+expected.published_jobs+" |",
  "",
  "Employer links without verified job cards are **not** counted. Fresher signals are not guarantees of eligibility.",
  "",
  "### Verified technology-role coverage",
  "",
  "| Role family | Published jobs | Explicit experience | Experience not specified | 0 years | 0–2 years | 3–5 years | 6+ years |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...Object.entries(roleCoverage).map(([name,row])=>
    "| "+({dotnet:".NET / C#",java:"Java / Spring",testing:"QA / Testing"}[name])+ " | "+
    [row.jobs,row.explicit_experience,row.experience_unspecified,row.zero_experience,
      row.fresher_to_two_years,row.three_to_five_years,row.six_plus_years].join(" | ")+" |"),
  "",
  "Role-family counts overlap if a posting explicitly targets multiple stacks; titles, departments and stated skills are used, not incidental description mentions.",
  "",
  "### Verified MNC breakdown",
  "",
  "| Employer | Published jobs | Entry signals | Explicit zero experience |",
  "| --- | ---: | ---: | ---: |"
];
for(const row of expected.companies)
  lines.push("| "+row.name.replace(/[|\r\n]/g," ")+" | "+row.postings+
    " | "+row.entry_positions+" | "+row.explicit_zero_experience+" |");
// Public, machine-readable evidence from the exact final feed used for Pages.
// Never include applicant details, raw descriptions, or unverified portal leads.
const evidence={
  schema:"careerops.coverage-evidence.v1",
  generated_at:feed.generated_at,
  market:"IN",
  source_feed:"data/jobs.json",
  published_jobs:jobs.length,
  entry_signals:entry,
  explicit_zero_experience:zero,
  enterprise_coverage:expected,
  role_coverage:roleCoverage,
  candidate_discovery:{
    checked:feed.scan?.candidate_discovery?.checked??0,
    activated:feed.scan?.candidate_discovery?.activated??0,
    quarantined:feed.scan?.candidate_discovery?.quarantined??0,
    unavailable:feed.scan?.candidate_discovery?.unavailable??0
  },
  note:"Employer and fresher counts are evidence-based signals, not guaranteed hiring eligibility."
};
if(process.env.COVERAGE_OUTPUT)
  writeFileSync(process.env.COVERAGE_OUTPUT,JSON.stringify(evidence,null,2)+"\n");
const report=lines.join("\n")+"\n";
process.stdout.write(report);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,report);
