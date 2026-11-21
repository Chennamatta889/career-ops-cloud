import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {scanBoard,balanceJobs,runScan,readPreviousCandidateHealth} from "./universal-job-scan.mjs";
import {discoverIndiaCandidates,checkCandidateCatalog,mergeIndiaCandidates}
  from "./india-candidate-expansion.mjs";
const require=createRequire(import.meta.url);
const {isIndiaLocation}=require("../india-jobs.js");
const registry=JSON.parse(readFileSync("scripts/india-employer-candidates.json","utf8"));
const fresherRegistry=JSON.parse(readFileSync("scripts/india-fresher-candidates.json","utf8"));
const earlyRegistry=JSON.parse(readFileSync("scripts/india-early-career-candidates.json","utf8"));
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

test("twenty freshers-focused employer leads are unique and not falsely counted as active sources",()=>{
  assert.equal(fresherRegistry.candidates.length,20);
  const all=[...registry.candidates,...fresherRegistry.candidates];
  assert.equal(checkCandidateCatalog(all),true);
  assert.ok(fresherRegistry.candidates.every(s=>s.focus==="fresher"));
  assert.ok(fresherRegistry.candidates.every(s=>s.reference_url?.startsWith("https://")));
  assert.ok(fresherRegistry.candidates.some(s=>s.provider==="smartrecruiters"));
  assert.ok(fresherRegistry.candidates.some(s=>s.provider==="lever"));
  assert.ok(fresherRegistry.candidates.some(s=>s.provider==="greenhouse"));
  assert.ok(fresherRegistry.candidates.some(s=>s.provider==="ashby"));
  const current=new Set(curated.map(s=>s.provider+":"+s.slug.toLowerCase()));
  assert.ok(fresherRegistry.candidates.every(s=>!current.has(s.provider+":"+s.slug.toLowerCase())));
});
test("freshers-focused SmartRecruiters candidate activates only for fresh, India-based real postings",async()=>{
  const fresher=fresherRegistry.candidates.find(s=>s.provider==="smartrecruiters");
  const out=await discoverIndiaCandidates({
    candidates:[fresher],curatedSources:[],scanBoard,isIndiaLocation,
    now:new Date("2026-11-21T10:00:00Z"),fetchImpl:async(url,opts)=>{
      assert.match(url,/api\.smartrecruiters\.com\/v1\/companies\//);
      assert.equal(opts.method,"GET");
      return fakeResponse({totalFound:3,content:[
        {id:"744000145000001",name:"Graduate Engineer Trainee",
          location:{city:"Bengaluru",country:"IN"},releasedDate:"2026-11-20T00:00:00Z"},
        {id:"744000145000002",name:"Summer Internship",
          location:{city:"Austin",country:"US"},releasedDate:"2026-11-20T00:00:00Z"},
        {id:"744000145000003",name:"Old India Apprentice",
          location:{city:"Hyderabad",country:"IN"},releasedDate:"2026-08-01T00:00:00Z"}
      ]});
    }
  });
  assert.equal(out.report.fresher_focus_checked,1);
  assert.equal(out.report.fresher_focus_activated,1);
  assert.equal(out.report.outdated_excluded,1);
  assert.equal(out.jobs.length,1);
  assert.equal(out.jobs[0].entry_level,"fresher");
  assert.equal(out.health[0].focus,"fresher");
});

test("new official early-career employer leads are not enrolled as curated or existing candidates",()=>{
  assert.equal(earlyRegistry.candidates.length,19);
  assert.equal(checkCandidateCatalog([
    ...earlyRegistry.candidates,...fresherRegistry.candidates,...registry.candidates]),true);
  const active=new Set(curated.map(x=>x.provider+":"+x.slug.toLowerCase()));
  assert.ok(earlyRegistry.candidates.every(x=>x.focus==="fresher"));
  assert.ok(earlyRegistry.candidates.every(x=>!active.has(x.provider+":"+x.slug.toLowerCase())));
  assert.ok(earlyRegistry.candidates.every(x=>x.reference_url.startsWith("https://")));
  assert.equal(earlyRegistry.candidates.filter(x=>x.indiaOnly===true).length,6);
  for(const slug of ["Eurofins","CamiAI","Kredx","Connectionphase"])assert.ok(
    earlyRegistry.candidates.some(x=>x.provider==="smartrecruiters"&&x.slug===slug&&x.indiaOnly===true),slug);
});
test("large global SmartRecruiters employer is queried with India server-side location filter",async()=>{
  const source=earlyRegistry.candidates.find(x=>x.slug==="AccorHotel");
  const urls=[];
  const result=await discoverIndiaCandidates({
    candidates:[source],curatedSources:[],scanBoard,isIndiaLocation,
    now:new Date("2026-11-21T08:00:00Z"),
    fetchImpl:async(url)=>{
      urls.push(url);
      const u=new URL(url);
      assert.equal(u.searchParams.get("country"),"IN");
      assert.equal(u.searchParams.get("limit"),"100");
      assert.equal(u.searchParams.get("offset"),"0");
      return fakeResponse({content:[
        {id:"744000162000001",name:"Apprentice - Hotel Operations",
          releasedDate:"2026-11-19T00:00:00Z",location:{city:"Bengaluru",country:"IN"}},
        {id:"744000162000002",name:"Old Hotel Trainee",
          releasedDate:"2026-06-12T00:00:00Z",location:{city:"Delhi",country:"IN"}}
      ],totalFound:2});
    }
  });
  assert.equal(urls.length,1);
  assert.equal(result.jobs.length,1);
  assert.equal(result.jobs[0].title,"Apprentice - Hotel Operations");
  assert.equal(result.report.outdated_excluded,1);
  assert.equal(result.report.fresher_focus_activated,1);
});

test("phase 10 repeated 404 boards are quarantined, not permanently deleted, and retried",async()=>{
  const board={provider:"greenhouse",slug:"missingboard",name:"Missing Board"};
  let calls=0;
  const fetchImpl=async()=>{calls++;return {ok:false,status:404};};
  const args={candidates:[board],curatedSources:[],scanBoard,isIndiaLocation,
    fetchImpl,now:new Date("2026-11-21T10:00:00Z")};
  const first=await discoverIndiaCandidates(args);
  assert.equal(first.report.checked,1);
  assert.equal(first.report.unavailable,1);
  assert.equal(first.history["greenhouse:missingboard"].consecutive_failures,1);
  const second=await discoverIndiaCandidates({...args,previousHealth:first.history});
  assert.equal(second.history["greenhouse:missingboard"].consecutive_failures,2);
  assert.equal(second.history["greenhouse:missingboard"].retry_after,"2026-11-28");
  const third=await discoverIndiaCandidates({...args,previousHealth:second.history});
  assert.equal(third.report.checked,0);
  assert.equal(third.report.quarantined,1);
  assert.equal(calls,2,"quarantined board must not generate network calls");
  const retry=await discoverIndiaCandidates({...args,now:new Date("2026-11-28T10:00:00Z"),
    previousHealth:third.history});
  assert.equal(retry.report.checked,1,"retry automatically after quarantine expires");
  assert.equal(calls,3);
});
test("phase 10 transient failures retry next day, success clears failure streak",async()=>{
  const board={provider:"greenhouse",slug:"recoveringboard",name:"Recovering"};
  let attempts=0;
  const fetchImpl=async()=>{
    attempts++;
    if(attempts<3)return {ok:false,status:503};
    return fakeResponse({jobs:[{id:9876501,title:"DevOps Engineer",
      location:{name:"Hyderabad, India"},first_published:"2026-11-21T00:00:00Z"}]});
  };
  const args={candidates:[board],curatedSources:[],scanBoard,isIndiaLocation,fetchImpl};
  const one=await discoverIndiaCandidates({...args,now:new Date("2026-11-21T10:00:00Z")});
  const two=await discoverIndiaCandidates({...args,now:new Date("2026-11-21T11:00:00Z"),previousHealth:one.history});
  const skipped=await discoverIndiaCandidates({...args,now:new Date("2026-11-21T12:00:00Z"),previousHealth:two.history});
  assert.equal(skipped.report.quarantined,1);
  assert.equal(skipped.history["greenhouse:recoveringboard"].retry_after,"2026-11-22");
  const recovered=await discoverIndiaCandidates({...args,now:new Date("2026-11-22T10:00:00Z"),
    previousHealth:skipped.history});
  assert.equal(recovered.report.activated,1);
  assert.equal(recovered.history["greenhouse:recoveringboard"].consecutive_failures,0);
  assert.equal(attempts,3);
});
test("phase 10 ignores arbitrary stale health keys and never skips a new board",async()=>{
  const board={provider:"greenhouse",slug:"newboard",name:"New Board"};
  const result=await discoverIndiaCandidates({candidates:[board],curatedSources:[],
    scanBoard,isIndiaLocation,now:new Date("2026-11-21T10:00:00Z"),
    previousHealth:{"greenhouse:otherboard":{status:"quarantined",
      consecutive_failures:100,retry_after:"2099-01-01"}},
    fetchImpl:async()=>fakeResponse({jobs:[]})});
  assert.equal(result.report.checked,1);
  assert.equal(result.report.quarantined,0);
  assert.deepEqual(Object.keys(result.history),["greenhouse:newboard"]);
});

test("phase 10 only imports previous health from a validated India public feed",async()=>{
  const valid={schema:"careerops.public-jobs.v1",market:"IN",scan:{india_only:true,
    candidate_health:{"greenhouse:board":{status:"unavailable",consecutive_failures:2,
      retry_after:"2026-11-28",kind:"not_found"}}}};
  const fetchImpl=async()=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(valid)});
  assert.deepEqual(await readPreviousCandidateHealth(fetchImpl),valid.scan.candidate_health);
  const invalid=async()=>({ok:true,headers:{get:()=>null},
    text:async()=>JSON.stringify({...valid,market:"US"})});
  assert.deepEqual(await readPreviousCandidateHealth(invalid),{});
  assert.deepEqual(await readPreviousCandidateHealth(async()=>{throw Error("offline")}),{});
});
