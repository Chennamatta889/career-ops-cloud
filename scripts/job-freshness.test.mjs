import test from "node:test";
import assert from "node:assert/strict";
import {isoDay,cutoffDay,hasRecentDate,filterRecentJobs,MAX_JOB_AGE_DAYS}
  from "./job-freshness.mjs";
import {scanBoard,runScan} from "./universal-job-scan.mjs";
const now=new Date("2026-11-21T12:00:00Z");
const respond=value=>{
  const raw=new TextEncoder().encode(JSON.stringify(value));let delivered=false;
  return {ok:true,status:200,headers:{get:()=>String(raw.length)},
    body:{getReader:()=>({read:async()=>delivered?{done:true}:{done:false,value:(delivered=true,raw)},
      releaseLock(){}})}};
};
test("validates actual ISO publication days rather than accepting rolled dates",()=>{
  assert.equal(isoDay("2026-02-30"),null);
  assert.equal(isoDay("2026-11-20T12:00:00Z"),"2026-11-20");
  assert.equal(isoDay("2026-01-01T00:15:00+05:30"),"2025-12-31");
  assert.equal(isoDay("not a date"),null);
  assert.equal(isoDay(null),null);
  assert.equal(isoDay(1784753233000),"2026-07-22");
});
test("UTC 30-day cutoff includes boundary and today, rejects old, future and undated",()=>{
  assert.equal(MAX_JOB_AGE_DAYS,30);
  assert.equal(cutoffDay(now),"2026-10-22");
  const sample=[
    {freshness_date:"2026-11-21"},{freshness_date:"2026-10-22"},
    {freshness_date:"2026-10-21"},{freshness_date:"2026-04-16"},
    {freshness_date:"2026-12-01"},{freshness_date:null}
  ];
  const r=filterRecentJobs(sample,now);
  assert.equal(r.jobs.length,2);
  assert.equal(r.outdated,2);
  assert.equal(r.future,1);
  assert.equal(r.undated,1);
  assert.equal(r.cutoff,"2026-10-22");
  assert.ok(hasRecentDate(sample[0],now));
  assert.ok(hasRecentDate(sample[1],now));
  assert.ok(!hasRecentDate(sample[2],now));
  assert.ok(!hasRecentDate(sample[5],now));
});
test("old Greenhouse publication with recent update is not misrepresented as fresh",async()=>{
  const source={provider:"greenhouse",slug:"sample",name:"Sample"};
  const feed=await runScan({now,sources:[source],fetchImpl:async()=>respond({jobs:[
    {id:991001,title:"Old DevOps Engineer",location:{name:"Hyderabad, India"},
      first_published:"2026-04-12T00:00:00Z",updated_at:"2026-11-21T10:00:00Z"},
    {id:991002,title:"New Platform Engineer",location:{name:"Pune, India"},
      first_published:"2026-11-18T00:00:00Z"},
    {id:991003,title:"Unknown creation",location:{name:"Bengaluru, India"},
      updated_at:"2026-11-21T00:00:00Z"},
    {id:991004,title:"Next month Engineer",location:{name:"Delhi, India"},
      first_published:"2026-12-01T00:00:00Z"},
    {id:991005,title:"Outside India Engineer",location:{name:"London, UK"},
      first_published:"2026-11-18T00:00:00Z"}
  ]})});
  assert.deepEqual(feed.jobs.map(j=>j.title),["New Platform Engineer"]);
  assert.equal(feed.jobs[0].freshness_basis,"published");
  assert.equal(feed.jobs[0].freshness_date,"2026-11-18");
  assert.equal(feed.scan.found,5);
  assert.equal(feed.scan.outdated_excluded,1);
  assert.equal(feed.scan.undated_excluded,1);
  assert.equal(feed.scan.future_excluded,1);
  assert.equal(feed.scan.date_cutoff_utc,"2026-10-22");
  assert.equal(feed.scan.max_job_age_days,30);
  assert.equal(feed.source_health[0].india_count,4);
  assert.equal(feed.source_health[0].count,1);
});
test("old Ashby updatedAt cannot revive a job; publishedAt controls inclusion",async()=>{
  const source={provider:"ashby",slug:"sample",name:"Sample"};
  const feed=await runScan({now,sources:[source],fetchImpl:async()=>respond({jobs:[
    {id:"aaa111",title:"Old Product Engineer",location:"India",
      publishedAt:"2026-05-12T08:00:00Z",updatedAt:"2026-11-20T08:00:00Z"},
    {id:"bbb222",title:"Recent Product Engineer",location:"India",
      publishedAt:"2026-11-19T08:00:00Z"}
  ]})});
  assert.equal(feed.jobs.length,1);
  assert.equal(feed.jobs[0].title,"Recent Product Engineer");
  assert.equal(feed.scan.outdated_excluded,1);
});
test("recent Lever creation proves possible 30-day eligibility but does not label publication time",async()=>{
  const source={provider:"lever",slug:"sample",name:"Sample"};
  const ts=Date.parse("2026-11-18T08:00:00Z");
  const old=Date.parse("2026-06-01T00:00:00Z");
  const feed=await runScan({now,sources:[source],fetchImpl:async url=>{
    const page=Number(new URL(url).searchParams.get("skip"));
    return respond(page?[]:[
      {id:"recent111",text:"SRE Engineer",categories:{location:"India"},createdAt:ts},
      {id:"older222",text:"Old DevOps Engineer",categories:{location:"India"},
        createdAt:old,updatedAt:Date.parse("2026-11-20T00:00:00Z")},
      {id:"unknown333",text:"Undated Platform Engineer",categories:{location:"India"}}
    ]);
  }});
  assert.equal(feed.jobs.length,1);
  assert.equal(feed.jobs[0].freshness_date,"2026-11-18");
  assert.equal(feed.jobs[0].freshness_basis,"created");
  assert.equal(feed.jobs[0].posted_at,null);
  assert.equal(feed.scan.outdated_excluded,1);
  assert.equal(feed.scan.undated_excluded,1);
});
test("SmartRecruiters releasedDate outside window and missing release date are excluded",async()=>{
  const feed=await runScan({now,sources:[{provider:"smartrecruiters",name:"Example",slug:"example"}],
    fetchImpl:async()=>respond({totalFound:3,content:[
      {id:"744000123456789",name:"Finance Manager",location:{country:"IN"},releasedDate:"2026-11-12T00:00:00Z"},
      {id:"744000123456790",name:"Old Engineer",location:{country:"IN"},releasedDate:"2026-04-14T00:00:00Z"},
      {id:"744000123456791",name:"Unknown Engineer",location:{country:"IN"}}
    ]})});
  assert.deepEqual(feed.jobs.map(j=>j.title),["Finance Manager"]);
  assert.equal(feed.scan.outdated_excluded,1);
  assert.equal(feed.scan.undated_excluded,1);
});
