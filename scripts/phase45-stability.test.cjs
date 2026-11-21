const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");

const app=fs.readFileSync(path.resolve(__dirname,"../app.js"),"utf8");
const privateSource=fs.readFileSync(path.resolve(__dirname,"../private-workspace.js"),"utf8");
const studio=fs.readFileSync(path.resolve(__dirname,"../ai-studio.js"),"utf8");
const USER_A="11111111-1111-4111-8111-111111111111";
const USER_B="22222222-2222-4222-8222-222222222222";
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function storage(initial={}){
  const values=new Map(Object.entries(initial));
  return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),
    removeItem:k=>values.delete(k),entries:()=>[...values]};
}
function dashboardHarness({initialLocal={},feedPromise}={}){
  const els=new Map(),docListeners=new Map(),winListeners=new Map(),events=[];
  const store=storage(initialLocal),session=storage();
  const el=id=>{
    if(!els.has(id)){
      const obj={id,hidden:false,disabled:false,value:"",textContent:"",innerHTML:"",dataset:{},
        open:false,attributes:new Map(),listeners:new Map(),
        classList:{add(){},remove(){},toggle(){return true;}},
        addEventListener(name,fn){this.listeners.set(name,fn)},
        setAttribute(name,val){this.attributes.set(name,val)},
        removeAttribute(name){this.attributes.delete(name)},
        getAttribute(name){return this.attributes.get(name)||""},
        querySelector:()=>({innerHTML:""}),showModal(){this.open=true},close(){this.open=false}
      };
      if(id==="matchFilter")obj.value="all";
      if(id==="sortFilter")obj.value="variety";
      els.set(id,obj);
    }return els.get(id);
  };
  const doc={getElementById:el,querySelectorAll:()=>[],
    querySelector:()=>({querySelector:()=>({innerHTML:""})}),
    addEventListener:(name,fn)=>docListeners.set(name,fn),
    createElement:()=>({click(){},remove(){},setAttribute(){}}),
    body:{appendChild(){},classList:{add(){},remove(){},toggle(){},contains(){return false}}}
  };
  const win={CareerOpsJobText:require("../job-text.js"),CareerOpsCategories:{
    categories:["IT & Software","Sales & Business","Other"],
    classify:(title)=>/software|developer|devops/i.test(title)?"IT & Software":/sales/i.test(title)?"Sales & Business":"Other"
  },CareerOpsMatch:{
    rank:()=>({score:65,quality:"Some evidence",role:{detail:"Role",points:35},location:{detail:"Location",points:20},
      skills:{detail:"Skills",points:10},experience:"Unknown",method:"rule-based"}),
    groups:()=>[]
  },
  addEventListener:(name,fn)=>{
    const list=winListeners.get(name)||[];list.push(fn);winListeners.set(name,list);
  },
  dispatchEvent(ev){events.push(ev);
    for(const fn of winListeners.get(ev.type)||[])fn(ev);
  },
  scrollTo(){}
  };
  class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}}
  const emptyFeed={schema:"careerops.public-jobs.v1",jobs:[],generated_at:"2026-11-21T05:00:00Z",
    scan:{status:"success",scanned:32,found:0,error_count:0}};
  const ctx={
    window:win,document:doc,localStorage:store,sessionStorage:session,
    fetch:()=>feedPromise||Promise.resolve({ok:true,json:async()=>emptyFeed}),
    location:{hash:"#overview"},history:{replaceState(){}},Date,URL,Blob,
    setTimeout:()=>1,clearTimeout(){},confirm:()=>true,CustomEvent
  };
  vm.runInNewContext(app,ctx,{filename:"app.js"});
  return {window:win,el,store,session,events,
    auth:id=>win.dispatchEvent(new CustomEvent("careerops:authenticated",{detail:{id}})),
    signOut:()=>win.dispatchEvent(new CustomEvent("careerops:signed-out")),
    changeStage(id,stage){docListeners.get("change")({target:{
      value:stage,matches:q=>q==="[data-stage-id]",
      getAttribute:k=>k==="data-stage-id"?id:null
    }})},
    clickListing(id){
      docListeners.get("click")({
        defaultPrevented:false,preventDefault(){throw Error("External navigation was blocked");},
        target:{closest(selector){
          if(selector==="[data-action]")return {
            getAttribute:key=>key==="data-action"?"open-listing":key==="data-id"?id:null
          };
          return null;
        }}
      });
    },
    clickButton(id){const fn=el(id).listeners.get("click");assert.ok(fn,"No button handler for "+id);fn();}

  };
}
const oldLocalJSON=JSON.stringify({mode:"manual",jobs:[{
  id:"old-1",title:"Private Legacy Role",company:"Old Job Co",location:"India",
  url:"",stage:"Saved",skills:[],description:"",demo:false,manual:true
}],prefs:{},activity:[]});
test("legacy browser-wide saved jobs are NEVER automatically visible to other Google accounts",async()=>{
  const h=dashboardHarness({initialLocal:{"career-ops-workspace-v1":oldLocalJSON}});
  h.auth(USER_A);await tick();
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs().length,0);
  assert.equal(h.window.CareerOpsDashboard.getLegacyTrackedJobs().length,1);
  assert.ok(h.store.getItem("career-ops-workspace-v1"),"old user data preserved until explicitly migrated");
});
test("switching Google accounts isolates jobs, even in the same open browser tab",async()=>{
  const h=dashboardHarness();
  h.auth(USER_A);
  h.window.CareerOpsDashboard.mergeRemoteTracking([{
    job_key:"manual:company a|devops engineer|hyderabad",
    title:"DevOps Engineer",company:"Company A",location:"Hyderabad",
    job_url:"",stage:"Saved"
  }]);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs().length,1);
  h.auth(USER_B);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs().length,0,"B must not see A's jobs");
  h.window.CareerOpsDashboard.mergeRemoteTracking([{
    job_key:"https://example.com/jobs/only-b",
    title:"Platform Engineer",company:"Company B",job_url:"https://example.com/jobs/only-b",stage:"Applied"
  }]);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].company,"Company B");
  h.signOut();
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs().length,0,"guest must not see A or B");
  h.auth(USER_A);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].company,"Company A","A's own tab-scoped jobs survive an account switch");
  assert.ok(!h.store.entries().some(([k])=>k.startsWith("career-ops-session-account-v1-")),"private tracking stays out of persistent browser localStorage");
});
test("manual job stage changes always emit same stable canonical job key, including unsave",async()=>{
  const h=dashboardHarness();
  h.auth(USER_A);
  h.window.CareerOpsDashboard.mergeRemoteTracking([{
    job_key:"manual:example co|cloud engineer|remote india",
    title:"Cloud Engineer",company:"Example Co",location:"Remote India",job_url:"",stage:"Saved"
  }]);
  const jobs=JSON.parse(h.session.getItem("career-ops-session-account-v1-"+USER_A)).jobs;
  const id=jobs.find(j=>j.company==="Example Co").id;
  h.changeStage(id,"Interview");
  const event1=h.events.filter(e=>e.type==="careerops:tracking-changed").at(-1);
  assert.equal(event1.detail.job.job_key,"manual:example co|cloud engineer|remote india");
  assert.equal(event1.detail.job.stage,"Interview");
  h.changeStage(id,"");
  const event2=h.events.filter(e=>e.type==="careerops:tracking-changed").at(-1);
  assert.equal(event2.detail.job.job_key,event1.detail.job.job_key);
  assert.equal(event2.detail.job.stage,"");
});
test("old in-flight public feed may not replace a newly signed-in user's stored tracking",async()=>{
  let finish;const pending=new Promise(r=>finish=r);
  const h=dashboardHarness({feedPromise:pending});
  h.auth(USER_A);
  h.window.CareerOpsDashboard.mergeRemoteTracking([{
    job_key:"https://example.com/my-job",title:"DevOps Engineer",company:"User A only",
    job_url:"https://example.com/my-job",stage:"Interview"
  }]);
  h.auth(USER_B);
  finish({ok:true,json:async()=>({schema:"careerops.public-jobs.v1",
    scan:{status:"success",scanned:32,found:1,error_count:0},
    generated_at:"2026-11-21T05:00:00Z",jobs:[
      {title:"Other job",company:"Possible company",url:"https://example.com/jobs/other"}
    ]})});
  await tick();await tick();
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs().length,0);
});
test("private REST requests validate account version before reading returned resume text",()=>{
  assert.match(privateSource,/accountVersion!==version \|\| currentUser\?\.id!==account\.id/g);
  assert.match(privateSource,/getLegacyTrackedJobs/);
  assert.match(privateSource,/clearLegacyTrackedJobs/);
  assert.match(privateSource,/loadVault\(true\)/);
  assert.match(privateSource,/currentUser\?\.id===info\.id/);
});
test("external ATS lookup refuses to overwrite edited or newer job detail forms",()=>{
  assert.match(studio,/jobFetchVersion/);
  assert.match(studio,/requestId!==jobFetchVersion/);
  assert.match(studio,/byId\("aiJd"\)\.value!==initialDescription/);
  assert.match(studio,/jobFetchVersion\+\+/);
});

test("IT and non-IT discovery filters keep unrelated categories discoverable",async()=>{
  const h=dashboardHarness();
  h.auth(USER_A);
  h.window.CareerOpsDashboard.mergeRemoteTracking([
    {job_key:"https://example.com/it",title:"Software Developer",company:"IT Co",
      location:"India",job_url:"https://example.com/it",stage:"Saved"},
    {job_key:"https://example.com/sales",title:"Sales Executive",company:"Retail Co",
      location:"India",job_url:"https://example.com/sales",stage:"Saved"}
  ]);
  const sector=h.el("sectorFilter");
  sector.value="non-it";
  sector.listeners.get("change")();
  assert.match(h.el("jobsGrid").innerHTML,/Sales Executive/);
  assert.doesNotMatch(h.el("jobsGrid").innerHTML,/Software Developer/);
  sector.value="it";
  sector.listeners.get("change")();
  assert.match(h.el("jobsGrid").innerHTML,/Software Developer/);
  assert.doesNotMatch(h.el("jobsGrid").innerHTML,/Sales Executive/);
  sector.value="";
  sector.listeners.get("change")();
  assert.match(h.el("jobsGrid").innerHTML,/Software Developer/);
  assert.match(h.el("jobsGrid").innerHTML,/Sales Executive/);
});

test("Phase 5 paginates job cards while preserving all searchable results and resets sorting",async()=>{
  const h=dashboardHarness();
  h.auth(USER_A);
  h.window.CareerOpsDashboard.mergeRemoteTracking(Array.from({length:45},(_,i)=>({
    job_key:"https://example.com/role-"+i,
    title:"Cloud DevOps AWS Engineer "+i,company:"Employer "+i,location:"India",
    job_url:"https://example.com/role-"+i,stage:"Saved"
  })));
  const countCards=()=>[...h.el("jobsGrid").innerHTML.matchAll(/class="job-card"/g)].length;
  assert.equal(countCards(),30,"initial DOM only renders the first thirty cards");
  assert.equal(h.el("loadMoreJobs").hidden,false);
  assert.equal(h.el("loadMoreJobs").textContent,"Show more jobs");
  h.el("loadMoreJobs").listeners.get("click")();
  assert.equal(countCards(),45,"load more preserves all matching jobs");
  assert.equal(h.el("loadMoreJobs").hidden,true);
  h.el("sortFilter").value="company";
  h.el("sortFilter").listeners.get("change")();
  assert.equal(countCards(),30,"filter and sort changes reset pagination");
  h.el("jobSearch").value="  DEVops,  awS  ";
  h.el("jobSearch").listeners.get("input")();
  assert.match(h.el("jobsGrid").innerHTML,/Cloud DevOps AWS Engineer/,"punctuation and whitespace match independent terms");
  assert.equal(h.el("resetDiscoverFilters").hidden,false);
  h.el("resetDiscoverFilters").listeners.get("click")();
  assert.equal(h.el("jobSearch").value,"");
  assert.equal(h.el("sortFilter").value,"variety");
  assert.equal(h.el("resetDiscoverFilters").hidden,true);
});
test("Phase 6 preserves tracked jobs and all searchable roles when a public feed exceeds 500",async()=>{
  const jobs=Array.from({length:725},(_,i)=>({
    title:"Public Role "+i,company:"Public Employer",location:"India",
    url:"https://job-boards.greenhouse.io/example/jobs/"+(100000+i),
    posted_at:"2026-11-20"
  }));
  const feed={schema:"careerops.public-jobs.v1",jobs,generated_at:"2026-11-21T05:00:00Z",
    scan:{status:"success",scanned:57,found:725,error_count:0}};
  const h=dashboardHarness({feedPromise:Promise.resolve({ok:true,json:async()=>feed})});
  h.auth(USER_A);
  h.window.CareerOpsDashboard.mergeRemoteTracking([{
    job_key:"https://example.com/personal-saved",
    title:"My tracked application",company:"My employer",location:"India",
    job_url:"https://example.com/personal-saved",stage:"Interview"
  }]);
  await tick();await tick();
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs().length,1);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].company,"My employer");
  assert.equal(h.el("loadMoreJobs").hidden,false);
  const stored=JSON.parse(h.session.getItem("career-ops-session-account-v1-"+USER_A));
  assert.equal(stored.jobs.length,1,"public job feed must not fill browser session storage");
  h.el("jobSearch").value="Public Role 724";
  h.el("jobSearch").listeners.get("input")();
  assert.match(h.el("jobsGrid").innerHTML,/Public Role 724/,"last job beyond old cap is searchable");
  assert.equal(h.el("loadMoreJobs").hidden,true);
});
test("Phase 5 warns when a successful-looking feed is stale and does not invent posting dates",async()=>{
  const feed={schema:"careerops.public-jobs.v1",jobs:[{
    title:"No date role",company:"Example Inc",location:"Remote",
    url:"https://jobs.ashbyhq.com/example/something"
  }],generated_at:"2020-01-01T00:00:00Z",
  scan:{status:"success",scanned:1,found:1,error_count:0}};
  const h=dashboardHarness({feedPromise:Promise.resolve({ok:true,json:async()=>feed})});
  await tick();await tick();
  assert.equal(h.el("feedFreshness").hidden,false);
  assert.match(h.el("feedFreshness").textContent,/over 48 hours old/);
  assert.match(h.el("jobsGrid").innerHTML,/Source date: date not provided/);
  assert.equal(h.el("headerFeedStatus").dataset.state,"partial");
});

test("Phase 6 Discover view shows cards, not public job totals, and mixes job types",async()=>{
  const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
  for(const legacyId of ["resultsCount","navJobsCount","statDiscovered"]){
    assert.ok(html.includes('id="'+legacyId+'" hidden'),
      "legacy scripts must find an invisible compatibility element");
  }
  assert.ok(html.includes("app.js?v=20261121-phase08-10-v1"));
  assert.ok(html.includes("styles.css?v=20261121-phase08-10-v1"));
  assert.ok(html.includes('id="discoverFeedStatus"'));
  assert.ok(html.includes('id="retryDiscoverFeed"'));
  assert.match(html,/value="variety">Explore all industries/);
  const h=dashboardHarness();
  h.auth(USER_A);
  h.window.CareerOpsDashboard.mergeRemoteTracking([
    ...Array.from({length:42},(_,i)=>({
      job_key:"https://example.com/it-"+i,title:"Software Developer "+i,
      company:"Tech",location:"India",job_url:"https://example.com/it-"+i,stage:"Saved"
    })),
    {job_key:"https://example.com/sales",title:"Sales Executive",company:"Retail",
      location:"India",job_url:"https://example.com/sales",stage:"Saved"},
    {job_key:"https://example.com/other",title:"General Associate",company:"Education",
      location:"India",job_url:"https://example.com/other",stage:"Saved"}
  ]);
  const cards=h.el("jobsGrid").innerHTML;
  assert.match(cards,/Sales Executive/);
  assert.match(cards,/General Associate/);
  assert.match(cards,/Software Developer/);
  assert.equal(h.el("loadMoreJobs").textContent,"Show more jobs");
});

test("Phase 6 compatibility smoke: all required dashboard element IDs exist in the HTML",()=>{
  const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
  const code=fs.readFileSync(path.resolve(__dirname,"../app.js"),"utf8");
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  const calledIds=[...new Set([...code.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map(match=>match[1]))];
  const absent=calledIds.filter(id=>!ids.has(id));
  assert.deepEqual(absent,[],"job cards must never crash because an expected UI element was removed");
});
test("Phase 6 shows useful messages when a feed is still loading or unavailable",async()=>{
  const h=dashboardHarness({feedPromise:Promise.reject(new Error("Network unavailable"))});
  await tick();await tick();
  assert.equal(h.el("discoverFeedStatus").hidden,false);
  assert.match(h.el("discoverFeedStatus").textContent,/couldn't be loaded/);
  assert.equal(h.el("retryDiscoverFeed").hidden,false);
});

test("Experience filter shows matching job cards and explicit unknowns without guessing",async()=>{
  const feed={schema:"careerops.public-jobs.v1",generated_at:"2026-11-21T10:00:00Z",
    scan:{status:"success",scanned:3,found:3,error_count:0},
    jobs:[
      {title:"Cloud Engineer",company:"Cloud Co",location:"India",
        url:"https://example.com/cloud",requiredExperience:"3–5 years",
        description:"Requirements: three years of experience and Kubernetes"},
      {title:"Support Associate",company:"Support Co",location:"India",
        url:"https://example.com/support",requiredExperience:"1–2 years",
        description:"1–2 years of customer service experience"},
      {title:"Marketing Specialist",company:"Marketing Co",location:"Remote",
        url:"https://example.com/marketing",description:"Senior creative thinker with excellent writing"}
    ]};
  const h=dashboardHarness({feedPromise:Promise.resolve({ok:true,json:async()=>feed})});
  await tick();await tick();
  assert.match(h.el("jobsGrid").innerHTML,/Experience: 3–5 years/);
  assert.match(h.el("jobsGrid").innerHTML,/Experience: 1–2 years/);
  assert.match(h.el("jobsGrid").innerHTML,/Experience: Not specified/);
  h.el("experienceFilter").value="3-5";
  h.el("experienceFilter").listeners.get("change")();
  assert.match(h.el("jobsGrid").innerHTML,/Cloud Engineer/);
  assert.doesNotMatch(h.el("jobsGrid").innerHTML,/Support Associate|Marketing Specialist/);
  h.el("experienceFilter").value="unspecified";
  h.el("experienceFilter").listeners.get("change")();
  assert.match(h.el("jobsGrid").innerHTML,/Marketing Specialist/);
  assert.doesNotMatch(h.el("jobsGrid").innerHTML,/Cloud Engineer|Support Associate/);
  h.el("resetDiscoverFilters").listeners.get("click")();
  assert.equal(h.el("experienceFilter").value,"");
  assert.match(h.el("jobsGrid").innerHTML,/Support Associate/);
});
test("Experience control exists in Discover and the details dialog",()=>{
  const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
  assert.match(html,/id="experienceFilter"/);
  assert.match(html,/value="fresher">Fresher/);
  assert.match(html,/value="unspecified">Not specified/);
  assert.match(html,/id="dialogExperience"/);
  assert.doesNotMatch(html,/id="resultsCount"[^>]*>[\d,]+/);
});

test("clicking an employer listing records Opened but never silently records Applied",async()=>{
  const h=dashboardHarness({feedPromise:Promise.resolve({ok:true,json:async()=>({
    schema:"careerops.public-jobs.v1",generated_at:"2026-11-21T10:00:00Z",
    scan:{status:"success",scanned:1,found:1,error_count:0},
    jobs:[{id:"sample-123",title:"Platform Engineer",company:"Example Ltd",location:"India",
      url:"https://job-boards.greenhouse.io/example/jobs/123123"}]
  })})});
  h.auth(USER_A);await tick();await tick();
  const id="sample-123";
  h.clickListing(id);
  const saved=JSON.parse(h.session.getItem("career-ops-session-account-v1-"+USER_A)).jobs[0];
  assert.equal(saved.stage,"Opened");
  assert.ok(saved.openedAt,"opening timestamp saved");
  assert.equal(saved.appliedOn,"");
  assert.equal(h.el("applicationFollowup").hidden,false);
  assert.match(h.el("confirmApplicationTitle").textContent,/successfully submit/);
  const event=h.events.filter(e=>e.type==="careerops:tracking-changed").at(-1);
  assert.equal(event.detail.job.stage,"Opened");
  assert.ok(event.detail.job.openedAt);
  assert.equal(event.detail.job.appliedOn,"");
  h.clickButton("confirmNotYet");
  assert.equal(h.el("applicationFollowup").hidden,true);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].stage,"Opened");
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].applied_on,null);
});
test("user confirms application date, rejects future dates, and keeps cloud date after refresh",async()=>{
  const h=dashboardHarness();
  h.auth(USER_A);
  h.window.CareerOpsDashboard.mergeRemoteTracking([{
    job_key:"https://example.com/jobs/cloud",job_url:"https://example.com/jobs/cloud",
    title:"Cloud Engineer",company:"Example",location:"India",stage:"Opened"
  }]);
  const id=JSON.parse(h.session.getItem("career-ops-session-account-v1-"+USER_A)).jobs[0].id;
  h.changeStage(id,"Applied");
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].stage,"Opened");
  assert.equal(h.el("applicationFollowup").hidden,false);
  h.el("confirmAppliedDate").value="2999-01-01";
  h.clickButton("confirmApplied");
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].stage,"Opened");
  assert.match(h.el("applicationFollowupError").textContent,/valid application date/);
  const today=new Date();
  h.el("confirmAppliedDate").value=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
  h.clickButton("confirmApplied");
  const applied=h.window.CareerOpsDashboard.getTrackedJobs()[0];
  assert.equal(applied.stage,"Applied");
  assert.match(applied.applied_on,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(h.el("applicationFollowup").hidden,true);
  assert.match(h.el("applicationsBoard").innerHTML,/Edit application date/);
  assert.match(h.el("applicationsBoard").innerHTML,/Applied/);
  const event=h.events.filter(e=>e.type==="careerops:tracking-changed").at(-1);
  assert.equal(event.detail.job.appliedOn,applied.applied_on);
  // Later employer feed refresh cannot drop user-entered confirmation dates.
  h.window.CareerOpsDashboard.mergeRemoteTracking([{
    job_key:applied.job_key,job_url:applied.job_url,title:applied.title,company:applied.company,
    stage:"Applied",applied_on:applied.applied_on,opened_at:applied.opened_at,
    updated_at:new Date(Date.now()+1000).toISOString()
  }]);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].applied_on,applied.applied_on);
});
test("application confirmation data remains isolated when Google accounts switch",()=>{
  const h=dashboardHarness();
  h.auth(USER_A);
  h.window.CareerOpsDashboard.mergeRemoteTracking([{
    job_key:"https://example.com/a",job_url:"https://example.com/a",title:"Cloud Developer",company:"A",
    stage:"Applied",opened_at:"2026-11-20T11:00:00Z",applied_on:"2026-11-21"
  }]);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].applied_on,"2026-11-21");
  h.auth(USER_B);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs().length,0);
  h.auth(USER_A);
  assert.equal(h.window.CareerOpsDashboard.getTrackedJobs()[0].applied_on,"2026-11-21");
});
