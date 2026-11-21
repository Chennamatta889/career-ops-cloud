#!/usr/bin/env node
/**
 * Phase 12: independently audit the final published feed, not employer leads.
 * Exit nonzero if fresher/MNC evidence disagrees with actual deduplicated jobs.
 * Only anonymous public metadata is printed; never applicant details.
 */
import {readFileSync,appendFileSync} from "node:fs";
import {measureEnterpriseCoverage} from "./india-candidate-expansion.mjs";
import {createRequire} from "node:module";
const {entryOpportunity}=createRequire(import.meta.url)("../job-text.js");
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
  "### Verified MNC breakdown",
  "",
  "| Employer | Published jobs | Entry signals | Explicit zero experience |",
  "| --- | ---: | ---: | ---: |"
];
for(const row of expected.companies)
  lines.push("| "+row.name.replace(/[|\r\n]/g," ")+" | "+row.postings+
    " | "+row.entry_positions+" | "+row.explicit_zero_experience+" |");
const report=lines.join("\n")+"\n";
process.stdout.write(report);
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,report);
