import test from "node:test";
import assert from "node:assert/strict";
import {mergeIndiaCandidates} from "../scripts/india-candidate-expansion.mjs";

test("Phase 12 published candidate evidence counts each unique official URL once",()=>{
  const existing={url:"https://jobs.example.org/existing",title:"Engineer",company:"Existing",category:"IT & Software",location:"Pune, India"};
  const newJob={url:"https://jobs.example.org/new",title:"Software Engineer",company:"Candidate",category:"IT & Software",location:"Pune, India"};
  const duplicate={...newJob,url:" HTTPS://JOBS.EXAMPLE.ORG/NEW " .trim().replace(/^HTTPS:/,"https:")};
  const feed={jobs:[existing],category_counts:{"IT & Software":1},source_health:[],scan:{scanned:1,found:1}};
  const expansion={jobs:[existing,newJob,duplicate],health:[],report:{inspected_positions:3,undated_excluded:0,outdated_excluded:0,future_excluded:0},history:{}};
  const result=mergeIndiaCandidates(feed,expansion,all=>all);
  const evidence=result.scan.candidate_discovery.published_evidence;
  assert.equal(evidence.unique_candidate_jobs,1);
  assert.equal(evidence.unique_candidate_entry_positions,0);
  assert.equal(evidence.employers_with_entry_positions,0);
  assert.equal(result.jobs.length,4,"The evidence fix must not silently alter publication balancing");
});

test("Phase 12 evidence excludes candidate posts already in curated feed",()=>{
  const job={url:"https://jobs.example.org/curated",title:"Engineer",company:"Existing",category:"IT & Software",location:"India"};
  const feed={jobs:[job],category_counts:{"IT & Software":1},source_health:[],scan:{scanned:1,found:1}};
  const expansion={jobs:[{...job}],health:[],report:{inspected_positions:1},history:{}};
  const result=mergeIndiaCandidates(feed,expansion,all=>all);
  assert.equal(result.scan.candidate_discovery.published_evidence.unique_candidate_jobs,0);
});
