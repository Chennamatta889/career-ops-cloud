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
    location:{name:"India"},first_published:"2026-11-21T00:00:00Z"
  }));
  const feed=await runScan({now:new Date("2026-11-21T12:00:00Z"),sources:[{provider:"greenhouse",slug:"sample",name:"Sample"}],
    fetchImpl:async()=>fakeResponse({jobs:roles})});
  assert.equal(feed.jobs.length,725);
  assert.equal(feed.scan.matched,725);
  assert.equal(feed.market,"IN");
  assert.equal(feed.scan.india_only,true);
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
  const result=await runScan({now:new Date("2026-11-21T12:00:00Z"),sources,fetchImpl:async(url)=>{
    if(url.includes("brokenboard"))throw Error("HTTP 404");
    return fakeResponse({jobs:[{id:12345,title:"Operations Coordinator",
      location:{name:"Chennai, India"},first_published:"2026-11-21T00:00:00Z"}]});
  }});
  assert.equal(result.scan.status,"partial");
  assert.equal(result.scan.found,1);
  assert.equal(result.jobs.length,1);
  assert.equal(result.jobs[0].category,"Operations & Logistics");
  assert.ok(!JSON.stringify(result).includes("candidate"));
  assert.ok(!JSON.stringify(result).includes("resume_text"));
});
test("all employer failures produce a failed feed and no fabricated positions",async()=>{
  const result=await runScan({now:new Date("2026-11-21T12:00:00Z"),sources:[{name:"Bad Board",provider:"greenhouse",slug:"broken"}],
    fetchImpl:async()=>{throw Error("HTTP 500");}});
  assert.equal(result.scan.status,"failed");
  assert.equal(result.jobs.length,0);
});

test("scheduled employer scan includes experience only when stated in the employer description",async()=>{
  const board={provider:"greenhouse",slug:"exampleboard",name:"Example Employer"};
  const jobs=await scanBoard(board,async()=>fakeResponse({jobs:[
    {id:80011,title:"Cloud Engineer",content:"<h3>Requirements</h3><p>3–5 years of relevant engineering experience.</p>"},
    {id:80012,title:"Sales Coordinator",content:"<p>We are happy to welcome freshers.</p>"},
    {id:80013,title:"Senior Manager",content:"<p>Lead people and manage projects. Knowledge of Excel required.</p>"}
  ]}));
  assert.equal(jobs.length,3);
  assert.equal(jobs[0].requiredExperience,"3–5 years");
  assert.equal(jobs[1].requiredExperience,"No experience required");
  assert.equal(jobs[2].requiredExperience,"","seniority alone must not invent minimum years");
});

test("Phase 10 source-health retains successful and failed board identity without inventing jobs",async()=>{
  const sources=[
    {name:"Board One",provider:"greenhouse",slug:"boardone"},
    {name:"Board Two",provider:"ashby",slug:"boardtwo"}
  ];
  const feed=await runScan({now:new Date("2026-11-21T12:00:00Z"),sources,fetchImpl:async url=>{
    if(url.includes("boardtwo"))throw Error("HTTP 404");
    return fakeResponse({jobs:[{id:122334,title:"Operations Assistant",location:{name:"Pune, India"},first_published:"2026-11-20T00:00:00Z"}]});
  }});
  assert.equal(feed.scan.status,"partial");
  assert.equal(feed.jobs.length,1);
  assert.deepEqual(feed.source_health.map(x=>x.status),["ok","error"]);
  assert.deepEqual(feed.source_health.map(x=>x.board),["boardone","boardtwo"]);
  assert.deepEqual(feed.source_health.map(x=>x.count),[1,0]);
  assert.doesNotMatch(JSON.stringify(feed),/applicant_email|resume_text|access_token/);
});
test("Phase 10 expands only known, unique public employer boards",()=>{
  for(const slug of ["ashby","ramp","linear"]){
    assert.ok(src.sources.some(x=>x.provider==="ashby"&&x.slug===slug),slug);
  }
  assert.ok(src.sources.length>=60);
});


test("Lever public postings are included without employer credentials or application submissions",async()=>{
  const board={provider:"lever",slug:"ttecdigital",name:"TTEC Digital"};
  const jobs=await scanBoard(board,async(url,options)=>{
    assert.equal(url,"https://api.lever.co/v0/postings/ttecdigital?mode=json&skip=0&limit=40");
    assert.equal(options.method,"GET");
    assert.equal(options.redirect,"error");
    return fakeResponse([{
      id:"93cbd388-4d8c-4f18-ab3c-3e9a76e9f207",
      text:"Senior Consultant – ServiceNow",
      categories:{department:"Consulting",location:"Hyderabad, India"},
      descriptionPlain:"You need 3+ years of ServiceNow engineering experience.",
      hostedUrl:"https://jobs.lever.co/ttecdigital/93cbd388-4d8c-4f18-ab3c-3e9a76e9f207",
      createdAt:1784753233000
    },{
      id:"a357ccbd-8dd5-49be-8711-0a0499eea924",
      text:"Salesforce Consultant",
      categories:{team:"CRM",location:"Remote"},
      descriptionPlain:"Experience integrating Salesforce with ServiceNow.",
      hostedUrl:"https://jobs.lever.co/ttecdigital/a357ccbd-8dd5-49be-8711-0a0499eea924"
    }]);
  });
  assert.equal(jobs.length,2);
  assert.equal(jobs[0].title,"Senior Consultant – ServiceNow");
  assert.equal(jobs[0].location,"Hyderabad, India");
  assert.equal(jobs[0].requiredExperience,"3+ years");
  assert.match(jobs[0].url,/^https:\/\/jobs\.lever\.co\/ttecdigital\//);
  assert.equal(jobs[0].source,"Lever public board");
  assert.equal(jobs[0].posted_at,null,"Lever createdAt is not a publication date");
  assert.equal(jobs[1].title,"Salesforce Consultant");
  assert.equal(jobs[1].category,"IT & Software");
});
test("Lever scan excludes invalid postings and refuses malformed or private API responses",async()=>{
  const board={provider:"lever",slug:"thinkahead",name:"AHEAD"};
  const results=await scanBoard(board,async()=>fakeResponse([{
    id:"fake-uuid-123",text:"ServiceNow Developer",categories:{location:"India"}
  },{id:"../unsafe",text:"ServiceNow Administrator"},{id:"",text:"Unknown"},{id:"id-ok",text:""}]));
  assert.deepEqual(results.map(x=>x.title),["ServiceNow Developer"]);
  await assert.rejects(scanBoard(board,async()=>fakeResponse({jobs:[]})),/postings array/);
});
test("ServiceNow and Salesforce platform titles are classified as IT, even when labeled consultant",()=>{
  assert.equal(classify("ServiceNow Developer",""),"IT & Software");
  assert.equal(classify("Senior Consultant – ServiceNow",""),"IT & Software");
  assert.equal(classify("Salesforce Consultant","CRM Implementation"),"IT & Software");
  assert.equal(classify("Service Now Platform Engineer",""),"IT & Software");
  assert.equal(classify("Sales Associate",""),"Sales & Business");
});
test("ServiceNow-focused public employer source catalog includes supported ATS providers",()=>{
  const expected=[
    ["greenhouse","anaplan"],["greenhouse","guidepointsecurity"],
    ["greenhouse","ltconsulting"],["ashby","rapdev"],["ashby","knox-systems"],
    ["lever","ttecdigital"],["lever","thinkahead"],["lever","fantom-corporation"]
  ];
  for(const [provider,slug]of expected)
    assert.ok(src.sources.some(s=>s.provider===provider&&s.slug===slug),provider+":"+slug);
  assert.ok(src.sources.length>=73);
});

test("large Lever employer feeds are paginated without silently skipping ServiceNow jobs",async()=>{
  const board={provider:"lever",slug:"cgsfederal",name:"Contact Government Services"};
  const visited=[];
  const fakePosting=i=>({
    id:"id"+String(i).padStart(6,"0"),
    text:i===48?"ServiceNow Developer":"Information Technology Consultant "+i,
    categories:{location:"United States"},
    descriptionPlain:"Engineering applications and infrastructure."
  });
  const jobs=await scanBoard(board,async(url,opts)=>{
    assert.equal(opts.method,"GET");
    const u=new URL(url);
    visited.push(Number(u.searchParams.get("skip")));
    assert.equal(u.searchParams.get("limit"),"40");
    const start=Number(u.searchParams.get("skip"));
    return fakeResponse(Array.from({length:Math.max(0,Math.min(40,93-start))},(_,i)=>fakePosting(start+i)));
  });
  assert.deepEqual(visited,[0,40,80]);
  assert.equal(jobs.length,93);
  assert.ok(jobs.some(j=>j.title==="ServiceNow Developer"));
  assert.ok(jobs.every(j=>j.url.startsWith("https://jobs.lever.co/cgsfederal/")));
});

test("ServiceNow SmartRecruiters board exposes all India postings using safe, complete pagination",async()=>{
  const board={provider:"smartrecruiters",slug:"ServiceNow",name:"ServiceNow"};
  const visited=[];
  const makeJob=i=>({
    id:String(744000100000000+i),name:i===101?"Cloud Platform Engineer":"Software Engineer",
    company:{identifier:"ServiceNow",name:"ServiceNow"},
    department:{label:"Engineering"},
    location:{city:"Hyderabad",region:"Telangana",country:"IN",remote:false},
    releasedDate:"2026-11-20T09:00:00Z"
  });
  const jobs=await scanBoard(board,async(url,options)=>{
    const u=new URL(url);
    assert.equal(u.origin,"https://api.smartrecruiters.com");
    assert.equal(u.pathname,"/v1/companies/ServiceNow/postings");
    assert.equal(options.method,"GET");
    assert.equal(options.redirect,"error");
    assert.equal(options.headers.Accept,"application/json");
    assert.equal(u.searchParams.get("limit"),"100");
    const offset=Number(u.searchParams.get("offset"));
    visited.push(offset);
    return fakeResponse({totalFound:103,offset,limit:100,content:
      Array.from({length:Math.max(0,Math.min(100,103-offset))},(_,i)=>makeJob(offset+i))});
  });
  assert.deepEqual(visited,[0,100]);
  assert.equal(jobs.length,103);
  assert.equal(jobs[0].company,"ServiceNow");
  assert.equal(jobs[0].location,"Hyderabad, Telangana, India");
  assert.equal(jobs[0].posted_at,"2026-11-20");
  assert.equal(jobs[0].requiredExperience,"","list payload cannot prove years required");
  assert.equal(jobs[0].source,"SmartRecruiters public board");
  assert.equal(jobs[0].category,"IT & Software");
  assert.equal(jobs[101].title,"Cloud Platform Engineer");
  assert.ok(jobs.every(j=>/^https:\/\/jobs\.smartrecruiters\.com\/ServiceNow\/744000/.test(j.url)));
  assert.equal(new Set(jobs.map(j=>j.url)).size,103);
});
test("SmartRecruiters fails closed on malformed, empty and truncated API pages",async()=>{
  const board={provider:"smartrecruiters",slug:"ServiceNow",name:"ServiceNow"};
  await assert.rejects(scanBoard(board,async()=>fakeResponse({jobs:[]})),/response is invalid/);
  await assert.rejects(scanBoard(board,async()=>fakeResponse({content:[],totalFound:2})),/incomplete page/);
  await assert.rejects(scanBoard(board,async()=>fakeResponse({
    content:[{id:"744000123456789",name:"Software Engineer",location:{country:"IN"}}],
    totalFound:200
  })),/truncated page/);
  const jobs=await scanBoard(board,async()=>fakeResponse({content:[
    {id:"../invalid",name:"Fake India Role",location:{country:"IN"}},
    {id:"744000123456789",name:"ITSM Administrator",location:{city:"Bengaluru",country:"IN"}},
    {id:"744000123456790",name:"Unlisted",active:false}
  ],totalFound:3}));
  assert.equal(jobs.length,1);
  assert.equal(jobs[0].location,"Bengaluru, India");
});
test("real ServiceNow company source is configured separately from ServiceNow consulting firms",()=>{
  assert.ok(src.sources.some(x=>x.provider==="smartrecruiters" &&
    x.slug==="ServiceNow" && x.name==="ServiceNow"));
  assert.ok(src.sources.length>=74);
});

test("Workable public employer feed imports published India roles using official links",async()=>{
  const source={provider:"workable",slug:"mercari-india",name:"Mercari India"};
  const result=await scanBoard(source,async(url,opts)=>{
    assert.equal(url,"https://apply.workable.com/api/v1/widget/accounts/mercari-india?details=true");
    assert.equal(opts.method,"GET");assert.equal(opts.redirect,"error");
    return fakeResponse({name:"Mercari, Inc. (India)",jobs:[
      {shortcode:"3C538C2CA4",title:"Software Engineer, Platform Engineering",
       city:"Bengaluru",state:"Karnataka",country:"India",
       department:"Engineering",published_on:"2026-11-20T12:00:00Z",
       description:"<p>Platform reliability and engineering.</p>",
       requirements:"3–5 years of relevant engineering experience."},
      {shortcode:"1C9B45B4E9",title:"Software Engineer, Backend",
       city:"Bengaluru",country:"India",workplace_type:"hybrid"},
      {shortcode:"../invalid",title:"Broken path",city:"Hyderabad",country:"India"}
    ]});
  });
  assert.equal(result.length,2);
  assert.equal(result[0].company,"Mercari India");
  assert.equal(result[0].location,"Bengaluru, Karnataka, India");
  assert.equal(result[0].requiredExperience,"3–5 years");
  assert.equal(result[0].posted_at,"2026-11-20");
  assert.equal(result[0].source,"Workable public board");
  assert.equal(result[0].url,"https://apply.workable.com/mercari-india/j/3C538C2CA4/");
  assert.equal(result[1].requiredExperience,"","no invented years without evidence");
  assert.equal(new Set(result.map(x=>x.url)).size,2);
});
test("Workable country and remote fields are explicitly represented without inference",async()=>{
  const jobs=await scanBoard({provider:"workable",slug:"teleport-careers",name:"Teleport"},
    async()=>fakeResponse({jobs:[
      {shortcode:"878A07AD45",title:"System Reliability Engineer",country:"IN",
       city:"Gurugram",state:"Haryana",telecommuting:false},
      {shortcode:"879A07AD45",title:"Remote Platform Engineer",country:"India",
       workplace_type:"remote"},
      {shortcode:"870A07AD45",title:"Unspecified place"}
    ]}));
  assert.deepEqual(jobs.map(j=>j.location),[
    "Gurugram, Haryana, India","Remote, India","Not specified"
  ]);
});
test("Workable invalid and closed API endpoints cannot create fake postings",async()=>{
  const source={provider:"workable",slug:"unisonGroup",name:"Unison Group"};
  await assert.rejects(scanBoard(source,async()=>fakeResponse({content:[]})),/Workable public employer response is invalid/);
  await assert.rejects(scanBoard(source,async()=>({ok:false,status:403})),/HTTP 403/);
});
test("unreachable Workable sources use employer career links instead of false job cards",()=>{
  const names=["mercari-india","capgemini-insurance","unisongroup","prox-works",
    "teleport-careers","updraft","youtrip","zyte"];
  const html=readFileSync("index.html","utf8");
  for(const slug of names){
    assert.ok(html.includes('href="https://apply.workable.com/'+slug+'/"'),slug);
    assert.ok(!src.sources.some(s=>s.provider==="workable"&&s.slug===slug),
      "Unavailable Workable feeds cannot count as active sources: "+slug);
  }
  assert.match(html,/These are original employer boards, not imported job cards/);
  assert.ok(src.sources.length>=80);
});

test("publishes only India-based employer jobs while counting all inspected records",async()=>{
  const source={provider:"greenhouse",slug:"mixedregion",name:"Example Employer"};
  const raw=[
    {id:70001,title:"DevOps Engineer",location:{name:"Hyderabad, Telangana, India"},first_published:"2026-11-20T00:00:00Z"},
    {id:70002,title:"Remote SRE",location:{name:"Remote - India"},first_published:"2026-11-20T00:00:00Z"},
    {id:70003,title:"Finance Manager",location:{name:"New Delhi"},first_published:"2026-11-20T00:00:00Z"},
    {id:70004,title:"Platform Engineer",location:{name:"Remote - US"}},
    {id:70005,title:"Software Engineer",location:{name:"London, United Kingdom"}},
    {id:70006,title:"Unspecified Location"},
    {id:70007,title:"Remote Global",location:{name:"Anywhere"}},
    {id:70008,title:"Indianapolis Engineer",location:{name:"Indianapolis, IN, USA"}}
  ];
  const feed=await runScan({now:new Date("2026-11-21T12:00:00Z"),sources:[source],fetchImpl:async()=>fakeResponse({jobs:raw})});
  assert.equal(feed.market,"IN");
  assert.equal(feed.scan.india_only,true);
  assert.equal(feed.scan.found,8);
  assert.equal(feed.scan.matched,3);
  assert.equal(feed.jobs.length,3);
  assert.deepEqual(feed.jobs.map(j=>j.title).sort(),
    ["DevOps Engineer","Finance Manager","Remote SRE"]);
  assert.equal(feed.source_health[0].count,3);
  assert.equal(feed.source_health[0].scanned_count,8);
  assert.match(feed.scope,/India-only/);
  assert.doesNotMatch(JSON.stringify(feed.jobs),/London|Indianapolis|Remote Global/);
});
test("India-only source selection works for structured SmartRecruiters countries",async()=>{
  const source={provider:"smartrecruiters",slug:"ServiceNow",name:"ServiceNow"};
  const positions=[
    {id:"744000145000001",name:"Platform Engineer",location:{city:"Hyderabad",country:"IN"},releasedDate:"2026-11-20T00:00:00Z"},
    {id:"744000145000002",name:"Software Engineer",location:{city:"San Diego",country:"US"}},
    {id:"744000145000003",name:"Remote Engineer",location:{remote:true,country:"IN"},releasedDate:"2026-11-20T00:00:00Z"},
    {id:"744000145000004",name:"Remote Global",location:{remote:true}}
  ];
  const feed=await runScan({now:new Date("2026-11-21T12:00:00Z"),sources:[source],
    fetchImpl:async()=>fakeResponse({totalFound:positions.length,content:positions})});
  assert.equal(feed.scan.found,4);
  assert.deepEqual(feed.jobs.map(j=>j.title).sort(),["Platform Engineer","Remote Engineer"]);
  assert.ok(feed.jobs.every(j=>/India/.test(j.location)));
});
test("all-global job boards remain healthy but publish zero India jobs",async()=>{
  const feed=await runScan({now:new Date("2026-11-21T12:00:00Z"),sources:[{provider:"greenhouse",slug:"globalcompany",name:"Global Company"}],
    fetchImpl:async()=>fakeResponse({jobs:[
      {id:71001,title:"SRE",location:{name:"Remote / Worldwide"}},
      {id:71002,title:"DevOps Engineer",location:{name:"United States"}}
    ]})});
  assert.equal(feed.scan.status,"success");
  assert.equal(feed.scan.found,2);
  assert.equal(feed.jobs.length,0);
  assert.equal(feed.source_health[0].count,0);
  assert.equal(feed.source_health[0].scanned_count,2);
});

test("Recruitee anonymous careers-site offers normalize only real public postings",async()=>{
  const company={provider:"recruitee",slug:"examplecompany",name:"Example Company"};
  const res=await scanBoard(company,async(url,opts)=>{
    assert.equal(url,"https://examplecompany.recruitee.com/api/offers/");
    assert.equal(opts.method,"GET");assert.equal(opts.redirect,"error");
    return fakeResponse({offers:[
      {id:123,slug:"platform-engineer-123",title:"Platform Engineer",
        locations:[{city:"Hyderabad",country:"India"}],department:"Engineering",
        description:"<p>Maintain cloud infrastructure</p>",published_at:"2026-11-20T00:00:00Z"},
      {slug:"sales-manager-456",position:"Sales Manager",city:"London",country:"UK"},
      {slug:"../../malicious",title:"Fake posting",city:"Bengaluru",country:"India"},
      {id:456,title:"No public careers slug",country:"India"}
    ]});
  });
  assert.equal(res.length,2);
  assert.equal(res[0].title,"Platform Engineer");
  assert.equal(res[0].location,"Hyderabad, India");
  assert.equal(res[0].company,"Example Company");
  assert.equal(res[0].posted_at,"2026-11-20");
  assert.equal(res[0].source,"Recruitee public board");
  assert.equal(res[0].url,"https://examplecompany.recruitee.com/o/platform-engineer-123");
  const feed=await runScan({now:new Date("2026-11-21T12:00:00Z"),sources:[company],fetchImpl:async()=>fakeResponse({offers:[
    {slug:"platform-engineer-123",title:"Platform Engineer",locations:[{city:"Hyderabad",country:"India"}],published_at:"2026-11-20T00:00:00Z"},
    {slug:"sales-manager-456",title:"Sales Manager",city:"London",country:"UK"}
  ]})});
  assert.equal(feed.jobs.length,1);
  assert.equal(feed.market,"IN");
});
test("Recruitee malformed responses do not generate invented vacancies",async()=>{
  const source={provider:"recruitee",slug:"examplecompany",name:"Example Company"};
  await assert.rejects(scanBoard(source,async()=>fakeResponse({jobs:[]})),/Recruitee public offers response is invalid/);
  await assert.rejects(scanBoard(source,async()=>({ok:false,status:403})),/HTTP 403/);
});
