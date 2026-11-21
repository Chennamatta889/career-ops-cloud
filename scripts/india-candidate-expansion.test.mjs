import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {scanBoard,balanceJobs,runScan} from "./universal-job-scan.mjs";
import {discoverIndiaCandidates,checkCandidateCatalog,mergeIndiaCandidates}
  from "./india-candidate-expansion.mjs";
const require=createRequire(import.meta.url);
const {isIndiaLocation}=require("../india-jobs.js");
const registry=JSON.parse(readFileSync("scripts/india-employer-candidates.json","utf8"));
const curated=JSON.parse(readFileSync("scripts/universal-job-sources.json","utf8")).sources;
const fakeResponse=obj=>{
  const bytes=new TextEncoder().encode(JSON.stringify(obj));let done=false;
  return {ok:true,status:200,headers:{get:()=>String(bytes.byteLength)},
    body:{getReader:()=>({read:async()=>done?{done:true}:{done:false,value:(done=true,bytes)},
      releaseLock(){}})}};
};
test("candidate registry is attributed, separated from curated boards and contains unique safe slugs",()=>{
  assert.equal(registry.provenance.license,"MIT");
  assert.match(registry.provenance.url,/github\.com/);
  assert.equal(registry.candidates.length,254);
  assert.equal(checkCandidateCatalog(registry.candidates),true);
  const active=new Set(curated.map(s=>s.provider+":"+s.slug.toLowerCase()));
  assert.ok(registry.candidates.every(s=>!active.has(s.provider+":"+s.slug.toLowerCase())));
  assert.ok(registry.candidates.every(s=>["ashby","lever","greenhouse"].includes(s.provider)));
});
test("invalid, duplicate and unsupported candidate identities are rejected before network fetches",()=>{
  assert.throws(()=>checkCandidateCatalog(null),/Invalid/);
  assert.throws(()=>checkCandidateCatalog([{provider:"unknown",name:"Example",slug:"slug"}]),/Invalid/);
  assert.throws(()=>checkCandidateCatalog([{provider:"greenhouse",name:"Bad",slug:"../../site"}]),/Invalid/);
  assert.throws(()=>checkCandidateCatalog([
    {provider:"lever",name:"A",slug:"sample"},
    {provider:"lever",name:"B",slug:"SAMPLE"}
  ]),/Duplicate/);
});
test("candidate discovery activates only real India vacancies; overseas, unknown and failed boards are excluded",async()=>{
  const candidates=[
    {provider:"greenhouse",slug:"indiaexample",name:"Example India"},
    {provider:"ashby",slug:"worldexample",name:"Example World"},
    {provider:"lever",slug:"closedexample",name:"Example Closed"},
    {provider:"lever",slug:"badexample",name:"Example Failed"},
    {provider:"greenhouse",slug:"currentboard",name:"Already Curated"}
  ];
  const urls=[];
  const expansion=await discoverIndiaCandidates({candidates,curatedSources:[{
    provider:"greenhouse",slug:"currentboard",name:"Already Curated"}],
    scanBoard,isIndiaLocation,concurrency:3,now:new Date("2026-11-21T12:00:00Z"),fetchImpl:async(url)=>{
      urls.push(url);
      if(url.includes("indiaexample"))return fakeResponse({jobs:[
        {id:777001,title:"Platform Engineer",location:{name:"Hyderabad, India"},first_published:"2026-11-20T00:00:00Z"},
        {id:777002,title:"Cloud Engineer",location:{name:"London, UK"}},
        {id:777003,title:"Remote Engineer",location:{name:"Remote Worldwide"}}
      ]});
      if(url.includes("worldexample"))return fakeResponse({jobs:[
        {id:"example-id-123",title:"Software Engineer",location:"United States"}
      ]});
      if(url.includes("closedexample"))return fakeResponse([]);
      return {ok:false,status:403};
    }});
  assert.equal(expansion.report.candidates,5);
  assert.equal(expansion.report.checked,4);
  assert.equal(expansion.report.already_curated,1);
  assert.equal(expansion.report.activated,1);
  assert.equal(expansion.report.no_india,2);
  assert.equal(expansion.report.unavailable,1);
  assert.equal(expansion.jobs.length,1);
  assert.equal(expansion.jobs[0].location,"Hyderabad, India");
  assert.equal(expansion.jobs[0].company,"Example India");
  assert.equal(expansion.health.length,1);
  assert.equal(expansion.health[0].discovered,true);
  assert.ok(urls.every(u=>!u.includes("currentboard")));
  assert.ok(urls.every(u=>u.startsWith("https://")));
});
test("candidate board request budget prevents unbounded pagination",async()=>{
  let calls=0;
  const expansion=await discoverIndiaCandidates({
    candidates:[{provider:"lever",slug:"endlesspages",name:"Endless"}],
    curatedSources:[],isIndiaLocation,concurrency:1,maxRequestsPerBoard:2,
    scanBoard:async(_source,request)=>{
      for(let i=0;i<20;i++)await request("https://api.lever.co/v0/postings/endlesspages",{});
      return [{title:"Unverified",url:"https://jobs.lever.co/endlesspages/123",company:"Endless",location:"India"}];
    },
    fetchImpl:async()=>{calls++;return fakeResponse([])}
  });
  assert.equal(calls,2);
  assert.equal(expansion.report.unavailable,1);
  assert.equal(expansion.report.activated,0);
  assert.equal(expansion.jobs.length,0);
});
test("candidate jobs merge without deleting curated jobs, duplicates or India publication safety",async()=>{
  const base=await runScan({now:new Date("2026-11-21T12:00:00Z"),sources:[{provider:"greenhouse",slug:"baseboard",name:"Base"}],
    fetchImpl:async()=>fakeResponse({jobs:[
      {id:1000,title:"DevOps Engineer",location:{name:"Bengaluru, India"},first_published:"2026-11-20T00:00:00Z"}
    ]})});
  const newJob={...base.jobs[0],id:"new-1",title:"SRE",company:"Additional",
    url:"https://jobs.lever.co/newcompany/new-1",location:"Hyderabad, India"};
  const ext={jobs:[base.jobs[0],newJob],
    health:[{provider:"lever",board:"newcompany",name:"Additional",status:"ok",
      count:2,scanned_count:2,discovered:true}],
    report:{candidates:254,already_curated:0,checked:254,activated:1,
      no_india:200,unavailable:53,inspected_positions:2,india_positions:2}};
  const merged=mergeIndiaCandidates(base,ext,balanceJobs);
  assert.equal(base.jobs.length,1);
  assert.equal(merged.jobs.length,2);
  assert.equal(merged.scan.scanned,2);
  assert.equal(merged.scan.matched,2);
  assert.equal(merged.source_health.length,2);
  assert.equal(merged.scan.candidate_discovery.checked,254);
  assert.ok(merged.jobs.every(j=>isIndiaLocation(j.location)));
  assert.equal(merged.scan.status,"success","candidate failures do not mark curated feeds unavailable");
});
