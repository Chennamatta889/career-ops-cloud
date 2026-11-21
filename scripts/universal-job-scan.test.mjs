import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {scanBoard,runScan,balanceJobs} from "./universal-job-scan.mjs";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const {classify,categories}=require("../job-categories.js");
const src=JSON.parse(readFileSync("scripts/universal-job-sources.json","utf8"));

const cases=[
  ["DevOps Engineer","IT & Software"],
  ["Senior HR Recruiter","HR & Recruitment"],
  ["Retail Store Manager","Hospitality & Retail"],
  ["Financial Accountant","Finance & Accounting"],
  ["Customer Support Associate","Customer Support"],
  ["Digital Marketing Specialist","Marketing & Creative"],
  ["Warehouse Operations Supervisor","Operations & Logistics"],
  ["Nurse Practitioner","Healthcare & Life Sciences"],
  ["School Teacher","Education & Training"],
  ["Quality Engineer","Manufacturing & Engineering"],
  ["Regional Sales Executive","Sales & Business"],
  ["Legal Counsel","Legal & Compliance"],
  ["New Team Member","Other"]
];
test("broad role classifier supports both IT and non-IT without discarding unknown titles",()=>{
  for(const [title,expected] of cases)assert.equal(classify(title,""),expected,title);
  assert.ok(categories.includes("Other"));
});
test("catalog includes broad industry boards and no bogus duplicate source",()=>{
  assert.ok(src.sources.length>=45);
  const unique=new Set(src.sources.map(x=>x.provider+":"+x.slug.toLowerCase()));
  assert.equal(unique.size,src.sources.length);
  assert.ok(src.sources.some(x=>x.sector==="Healthcare"));
  assert.ok(src.sources.some(x=>x.sector==="Education"));
  assert.ok(src.sources.some(x=>x.sector==="Retail"));
  assert.ok(src.sources.some(x=>x.sector==="Marketing"));
  assert.ok(src.sources.every(x=>/^[\w-]{2,90}$/.test(x.slug)));
});
const fakeResponse=obj=>{
  const raw=new TextEncoder().encode(JSON.stringify(obj));
  let delivered=false;
  return {ok:true,status:200,headers:{get:()=>String(raw.length)},
    body:{getReader:()=>({
      read:async()=>delivered?{done:true}:{done:false,value:(delivered=true,raw)},
      releaseLock(){}
    })}};
};
test("scanner accepts ALL role titles including senior, manager, internship and non-IT overseas postings",async()=>{
  const company={provider:"greenhouse",slug:"examplecompany",name:"Example Company"};
  const titles=["DevOps Engineer","Customer Care Manager","Sales Intern","Chief Financial Officer","Retail Store Manager"];
  const fetcher=async(url,config)=>{
    assert.match(url,/boards-api\.greenhouse\.io/);
    assert.equal(config.method,"GET");assert.equal(config.redirect,"error");
    return fakeResponse({jobs:titles.map((title,i)=>({
      id:5000+i,title,location:{name:"London, United Kingdom"},
      departments:[{name:i===2?"Sales":""}],updated_at:"2026-11-21T10:00:00Z"
    }))});
  };
  const results=await scanBoard(company,fetcher);
  assert.equal(results.length,5);
  assert.equal(results.find(x=>x.title==="Customer Care Manager").category,"Customer Support");
  assert.equal(results.find(x=>x.title==="Sales Intern").category,"Sales & Business");
  assert.equal(results.find(x=>x.title==="Retail Store Manager").category,"Hospitality & Retail");
  assert.ok(results.every(x=>x.location.includes("London")));
  assert.ok(results.every(x=>x.url.startsWith("https://job-boards.greenhouse.io/examplecompany/jobs/")));
});
test("Ashby excludes unlisted job postings, but keeps all listed non-IT and senior roles",async()=>{
  const feed=await scanBoard({provider:"ashby",slug:"testcompany",name:"Example Ashby"},
    async(url,config)=>{
      assert.match(url,/api\.ashbyhq\.com\/posting-api\/job-board\/testcompany/);
      return fakeResponse({jobs:[
        {id:"abc-123",title:"Finance Manager",location:"India",isListed:true},
        {id:"def-456",title:"Hospitality Coordinator",location:"Canada",isListed:true},
        {id:"hidden-789",title:"Hidden Application",location:"Remote",isListed:false}
      ]});
    });
  assert.equal(feed.length,2);
  assert.equal(feed[0].category,"Finance & Accounting");
});
test("scanner publishes every unique posting and interleaves all available categories",()=>{
  const many=Array.from({length:720},(_,i)=>({title:"Software Engineer",company:"A",
    url:"https://job-boards.greenhouse.io/a/jobs/"+(1000+i),category:"IT & Software",posted_at:"2026-11-21"}));
  const nonIT=["Sales & Business","Customer Support","Marketing & Creative","Finance & Accounting",
    "Healthcare & Life Sciences","Hospitality & Retail"].map((c,i)=>({title:"Other role",company:"B",
    url:"https://job-boards.greenhouse.io/b/jobs/"+(1000+i),category:c,posted_at:"2026-11-21"}));
  const picked=balanceJobs([...many,...nonIT,many[0]]);
  assert.equal(picked.length,726,"no fixed publishing cap and duplicated URLs are removed");
  assert.equal(new Set(picked.map(j=>j.url)).size,picked.length);
  for(const kind of nonIT)assert.ok(picked.slice(0,30).some(j=>j.category===kind.category),kind.category);
  assert.equal(picked.filter(j=>j.category==="IT & Software").length,720);
});
test("complete scan publishes more than 500 unique jobs without title, seniority or category exclusions",async()=>{
  const roles=Array.from({length:725},(_,i)=>({
    id:100000+i,title:i%3===0?"Junior Sales Associate":i%3===1?"DevOps Engineer":"Nurse Practitioner",
    location:{name:"India"},updated_at:"2026-11-21T00:00:00Z"
  }));
  const feed=await runScan({sources:[{provider:"greenhouse",slug:"sample",name:"Sample"}],
    fetchImpl:async()=>fakeResponse({jobs:roles})});
  assert.equal(feed.jobs.length,725);
  assert.equal(feed.scan.matched,725);
  assert.equal(feed.scan.max_published,undefined,"the former publishing ceiling is removed");
  assert.ok(feed.jobs.some(j=>j.category==="Healthcare & Life Sciences"));
  assert.ok(feed.jobs.some(j=>j.category==="Sales & Business"));
  assert.ok(feed.jobs.some(j=>j.category==="IT & Software"));
});
test("one employer failure becomes partial; no private applicant fields reach public JSON",async()=>{
  const sources=[
    {name:"Works",provider:"greenhouse",slug:"workingboard"},
    {name:"Unavailable",provider:"greenhouse",slug:"brokenboard"}
  ];
  const result=await runScan({sources,fetchImpl:async(url)=>{
    if(url.includes("brokenboard"))throw Error("HTTP 404");
    return fakeResponse({jobs:[{id:12345,title:"Operations Coordinator",
      location:{name:"Chennai, India"},updated_at:"2026-11-21T00:00:00Z"}]});
  }});
  assert.equal(result.scan.status,"partial");
  assert.equal(result.scan.found,1);
  assert.equal(result.jobs.length,1);
  assert.equal(result.jobs[0].category,"Operations & Logistics");
  assert.ok(!JSON.stringify(result).includes("candidate"));
  assert.ok(!JSON.stringify(result).includes("resume_text"));
});
test("all employer failures produce a failed feed and no fabricated positions",async()=>{
  const result=await runScan({sources:[{name:"Bad Board",provider:"greenhouse",slug:"broken"}],
    fetchImpl:async()=>{throw Error("HTTP 500");}});
  assert.equal(result.scan.status,"failed");
  assert.equal(result.jobs.length,0);
});
