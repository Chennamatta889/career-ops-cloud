import test from "node:test";
import assert from "node:assert/strict";
import {parseJobLink,plainText,jobFromPayload,fetchPublicJob} from "../supabase/functions/careerops-ai-review/job-fetch.mjs";

test("recognizes current employer URLs and builds hardcoded public APIs",()=>{
  const ashby=parseJobLink("https://jobs.ashbyhq.com/buspatrol/ecf9c172-daf7-4ca9-bb63-117f6badf621");
  assert.equal(ashby.provider,"ashby");
  assert.equal(ashby.api,"https://api.ashbyhq.com/posting-api/job-board/buspatrol");
  assert.equal(parseJobLink("https://job-boards.greenhouse.io/gleanwork/jobs/123456").api,
    "https://boards-api.greenhouse.io/v1/boards/gleanwork/jobs/123456");
  assert.equal(parseJobLink("https://jobs.lever.co/example/e9ed20fd-d45f-4aad-8a00-a19bfba0083e").provider,"lever");
});
test("rejects arbitrary hosts, credentials, redirects and untrusted internal URLs",()=>{
  for(const url of [
    "http://jobs.ashbyhq.com/buspatrol/123456",
    "https://jobs.ashbyhq.com.evil.io/org/job",
    "https://username:password@jobs.ashbyhq.com/org/123456",
    "https://localhost/admin/internal",
    "https://127.0.0.1/private",
    "https://job-boards.greenhouse.io/org/jobs/22/extra",
    "https://jobs.ashbyhq.com/org/%2e%2e/anything",
    "https://jobs.ashbyhq.com/org",
    "https://jobs.lever.co/evil.org/job",
    "https://jobs.ashbyhq.com:8443/org/123456"
  ]) assert.equal(parseJobLink(url),null,url);
});
test("extracts Ashby public description for exact URL match",()=>{
  const link=parseJobLink("https://jobs.ashbyhq.com/buspatrol/uuid-abc");
  const job=jobFromPayload(link,{jobs:[
    {title:"Wrong position",id:"uuid-other",jobUrl:"https://jobs.ashbyhq.com/buspatrol/uuid-other",descriptionPlain:"Wrong".repeat(120)},
    {title:"Platform Engineer",id:"uuid-abc",jobUrl:"https://jobs.ashbyhq.com/buspatrol/uuid-abc",location:"Hyderabad, India",descriptionPlain:"Own cloud platforms and reliability. ".repeat(15)}
  ]});
  assert.equal(job.title,"Platform Engineer");
  assert.equal(job.provider,"ashby");
  assert.ok(job.description.includes("cloud platforms"));
});
test("extracts and cleans Greenhouse HTML without executing HTML",()=>{
  const link=parseJobLink("https://boards.greenhouse.io/fakeboard/jobs/123456");
  const job=jobFromPayload(link,{id:123456,title:"DevOps Engineer",location:{name:"India"},content:"<h3>About</h3><p>Build container platforms.</p><script>malicious()</script><ul><li>AWS</li><li>Jenkins</li></ul>".repeat(6)});
  assert.ok(job.description.includes("AWS"));
  assert.ok(!job.description.includes("<script>"));
  assert.ok(!job.description.includes("malicious()"));
});
test("plain text conversion removes scripts and HTML tags",()=>{
  assert.equal(plainText("<p>DevOps &amp; SRE</p><script>bad()</script><p>AWS</p>"),"DevOps & SRE\nAWS");
});
test("unknown and short postings fail rather than making up a JD",()=>{
  const link=parseJobLink("https://jobs.ashbyhq.com/buspatrol/uuid-abc");
  assert.equal(jobFromPayload(link,{jobs:[]}),null);
});
test("fetcher reads only validated canonical ATS API, with redirects disabled",async()=>{
  const link="https://jobs.ashbyhq.com/buspatrol/uuid-abc?gh_jid=123";
  let called="";
  const fake=async (url,opts)=>{
    called=url;
    assert.equal(opts.redirect,"error");
    return new Response(JSON.stringify({jobs:[{
      id:"uuid-abc",title:"SRE",jobUrl:"https://jobs.ashbyhq.com/buspatrol/uuid-abc",
      descriptionPlain:"Reliability, Linux, alerts and Kubernetes. ".repeat(10)
    }]}),{status:200,headers:{"content-type":"application/json"}});
  };
  const job=await fetchPublicJob(link,fake);
  assert.equal(job.title,"SRE");
  assert.equal(called,"https://api.ashbyhq.com/posting-api/job-board/buspatrol");
});
