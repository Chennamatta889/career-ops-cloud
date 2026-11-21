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
      if(id==="sortFilter")obj.value="newest";
      els.set(id,obj);
    }return els.get(id);
  };
  const doc={getElementById:el,querySelectorAll:()=>[],
    querySelector:()=>({querySelector:()=>({innerHTML:""})}),
    addEventListener:(name,fn)=>docListeners.set(name,fn),
    createElement:()=>({click(){},remove(){},setAttribute(){}}),
    body:{appendChild(){},classList:{add(){},remove(){},toggle(){},contains(){return false}}}
  };
  const win={CareerOpsCategories:{
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
    }})}
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
  assert.match(h.el("resultsCount").textContent,/showing 30/);
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
  assert.equal(h.el("sortFilter").value,"newest");
  assert.equal(h.el("resetDiscoverFilters").hidden,true);
});
test("Phase 5 preserves saved and manually tracked jobs when a 500-job public feed arrives",async()=>{
  const jobs=Array.from({length:500},(_,i)=>({
    title:"Public Role "+i,company:"Public Employer",location:"India",
    url:"https://job-boards.greenhouse.io/example/jobs/"+(100000+i),
    posted_at:"2026-11-20"
  }));
  const feed={schema:"careerops.public-jobs.v1",jobs,generated_at:"2026-11-21T05:00:00Z",
    scan:{status:"success",scanned:57,found:500,error_count:0}};
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
  assert.match(h.el("resultsCount").textContent,/500 job listings/);
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
