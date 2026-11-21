const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const script=fs.readFileSync(path.join(__dirname,"../private-workspace.js"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const sql=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261121_phase4_private_vault_tracking.sql"),"utf8");
const uid="7fdc93a6-57f6-47a8-bce0-6d354ee7d0f8";
const resume="Cloud DevOps Engineer with experience in AWS, Jenkins, Terraform and production support. ".repeat(6);
const flush=()=>new Promise(r=>setImmediate(r));
function harness({signedIn=true,tracked=[],responseForWrite}={}){
  const els=new Map(),events=new Map(),requests=[];
  const el=id=>{
    if(!els.has(id))els.set(id,{
      value:"",textContent:"",disabled:false,checked:false,dataset:{},listeners:new Map(),
      addEventListener(k,fn){this.listeners.set(k,fn)},
      dispatchEvent(){},click(){},scrollIntoView(){},focus(){}
    });
    return els.get(id);
  };
  const window={
    CAREEROPS_PRIVATE_CONFIG:{
      supabaseUrl:"https://nnhzihcugvifhegsfmua.supabase.co",
      publishableKey:"sb_publishable_public_test_key_1234567890"
    },
    CareerOpsAuth:{getAccessToken:async()=>"fake-jwt-access-token"},
    CareerOpsDashboard:{getTrackedJobs:()=>tracked,mergeRemoteTracking:(rows)=>rows.length},
    confirm:()=>true,
    addEventListener(name,fn){events.set(name,fn)},
  };
  const document={getElementById:el};
  const fetch=async(url,options)=>{
    requests.push({url:String(url),method:options.method,body:options.body,headers:options.headers});
    if(options.method==="GET")return {ok:true,status:200,json:async()=>[]};
    if(responseForWrite)return responseForWrite(url,options);
    return {ok:true,status:204,json:async()=>({})};
  };
  vm.runInNewContext(script,{window,document,fetch,URL,Event:class Event{},AbortSignal,Date,
    console, setTimeout, clearTimeout});
  if(signedIn)events.get("careerops:authenticated")({detail:{id:uid,email:"approved@example.com"}});
  return {
    el,events,requests,
    dispatch:(event,detail)=>events.get(event)({detail}),
    click:id=>el(id).listeners.get("click")(),
  };
}
test("owner-only schema enables RLS and requires authenticated ownership for every action",()=>{
  assert.match(sql,/create table if not exists public\.careerops_resume_vault/);
  assert.match(sql,/create table if not exists public\.careerops_job_tracking/);
  assert.equal((sql.match(/enable row level security/g)||[]).length,2);
  assert.equal((sql.match(/create policy "/g)||[]).length,8);
  assert.equal((sql.match(/with check \(\(select auth\.uid\(\)\) = user_id\)/g)||[]).length,4);
  assert.match(sql,/revoke all on table public\.careerops_resume_vault from public, anon/);
  assert.match(sql,/revoke all on table public\.careerops_job_tracking from public, anon/);
  assert.doesNotMatch(sql,/to anon|using \(true\)|with check \(true\)/);
});
test("vault controls require authenticated session and never store raw resume in localStorage",async()=>{
  const h=harness({signedIn:false});
  h.el("aiResume").value=resume;
  await h.click("vaultSave");
  assert.equal(h.requests.length,0);
  assert.match(h.el("vaultStatus").textContent,/Sign in with Google/);
  assert.doesNotMatch(script,/localStorage\.setItem\(/);
  assert.doesNotMatch(script,/service_role|sb_secret_|GEMINI_API_KEY/);
});
test("saving resume performs an owner-scoped upsert through Supabase REST, not Gemini",async()=>{
  const h=harness();await flush();h.requests.length=0;
  h.el("aiResume").value=resume;
  h.el("aiResumeParseStatus").dataset.filename="resume.pdf";
  await h.click("vaultSave");
  const p=h.requests[0];
  assert.equal(p.method,"POST");
  assert.match(p.url,/\/rest\/v1\/careerops_resume_vault\?on_conflict=user_id/);
  const body=JSON.parse(p.body);
  assert.equal(body.user_id,uid);
  assert.equal(body.resume_text,resume.trim());
  assert.equal(body.source_filename,"resume.pdf");
  assert.equal(p.headers.Authorization,"Bearer fake-jwt-access-token");
  assert.match(h.el("vaultStatus").textContent,/saved privately/);
  assert.doesNotMatch(p.url,/AWS|Jenkins|resume\.pdf/);
});
test("removing a saved job deletes its server row, with no duplicate upload",async()=>{
  const h=harness();await flush();h.requests.length=0;
  const job={title:"Cloud DevOps Engineer",company:"Example",location:"Hyderabad",
    url:"https://jobs.ashbyhq.com/example/abc-def",stage:""};
  h.dispatch("careerops:tracking-changed",{job});
  await flush();
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].method,"DELETE");
  assert.match(h.requests[0].url,/\/careerops_job_tracking\?/);
  assert.ok(h.requests[0].url.includes("job_key=eq."));
});
test("tracked job stage edits upsert only real job metadata, never resume content",async()=>{
  const h=harness();await flush();h.requests.length=0;
  h.dispatch("careerops:tracking-changed",{job:{
    title:"Platform Engineer",company:"Example Ltd",location:"Bengaluru",url:"https://example.com/jobs/123",stage:"Interview"
  }});
  await flush();
  assert.equal(h.requests[0].method,"POST");
  const body=JSON.parse(h.requests[0].body);
  assert.equal(body.stage,"Interview");
  assert.equal(body.user_id,uid);
  assert.equal(body.job_key,"https://example.com/jobs/123");
  assert.equal(Object.hasOwn(body,"resume_text"),false);
});
test("application dashboard never emits cloud events for demo listings",()=>{
  assert.match(app,/if\(!job \|\| job\.demo\) return/);
  assert.match(app,/getTrackedJobs:function/);
  assert.match(app,/mergeRemoteTracking:function/);
  assert.match(html,/id="vaultSave"/);
  assert.match(html,/id="cloudImportTracking"/);
});
test("loading a saved resume from REST fills the editor only when requested",async()=>{
  const h=harness();await flush();h.requests.length=0;
  // The private vault loads via a direct user action, not automatic login.
  assert.ok(!h.requests.some(r=>r.url.includes("select=resume_text")));
  assert.match(script,/async function loadVault\(onlyIfEmpty=false\)/);
});

test("application tracking migration adds private opened and submitted dates without changing RLS",()=>{
  const migration=fs.readFileSync(path.join(__dirname,
    "../supabase/migrations/20261121_phase6_application_confirmation_tracking.sql"),"utf8");
  assert.match(migration,/add column if not exists opened_at timestamptz/);
  assert.match(migration,/add column if not exists applied_on date/);
  assert.match(migration,/stage in \('Opened','Saved','Review','Applied','Interview','Offer','Rejected'\)/);
  assert.doesNotMatch(migration,/disable row level security|grant .* to anon|service_role/);
});
test("opening a job syncs Opened with timestamp without claiming a submission",async()=>{
  const h=harness();await flush();h.requests.length=0;
  h.dispatch("careerops:tracking-changed",{job:{
    title:"DevOps Engineer",company:"Example Corp",location:"India",
    url:"https://example.com/jobs/100",stage:"Opened",
    openedAt:"2026-11-21T07:00:00.000Z",appliedOn:""
  }});
  await flush();
  const request=h.requests.find(x=>x.method==="POST"&&x.url.includes("careerops_job_tracking"));
  assert.ok(request);
  const value=JSON.parse(request.body);
  assert.equal(value.stage,"Opened");
  assert.equal(value.opened_at,"2026-11-21T07:00:00.000Z");
  assert.equal(value.applied_on,null);
});
test("user-confirmed date is persisted only after an explicit Applied status event",async()=>{
  const h=harness();await flush();h.requests.length=0;
  h.dispatch("careerops:tracking-changed",{job:{
    job_key:"https://example.com/jobs/applied",title:"Cloud Engineer",company:"Example",location:"India",
    url:"https://example.com/jobs/applied",stage:"Applied",openedAt:"2026-11-20T07:00:00Z",
    appliedOn:"2026-11-21"
  }});
  await flush();
  const value=JSON.parse(h.requests.find(x=>x.method==="POST"&&x.url.includes("careerops_job_tracking")).body);
  assert.equal(value.stage,"Applied");
  assert.equal(value.applied_on,"2026-11-21");
  assert.equal(value.opened_at,"2026-11-20T07:00:00.000Z");
  assert.equal(Object.hasOwn(value,"resume_text"),false);
});

test("rapid Opened → Applied writes are serialized, preserving the user's confirmation",async()=>{
  let releaseOpened;
  const pendingOpened=new Promise(resolve=>{releaseOpened=resolve;});
  const h=harness({responseForWrite:(_url,options)=>{
    if(JSON.parse(options.body).stage==="Opened")return pendingOpened;
    return {ok:true,status:204};
  }});
  await flush();
  h.requests.length=0;
  const base={job_key:"https://example.com/careers/123",title:"Engineer",
    company:"Employer",url:"https://example.com/careers/123",location:"Remote"};
  h.dispatch("careerops:tracking-changed",{job:{
    ...base,stage:"Opened",openedAt:"2026-11-21T08:00:00Z"
  }});
  h.dispatch("careerops:tracking-changed",{job:{
    ...base,stage:"Applied",openedAt:"2026-11-21T08:00:00Z",appliedOn:"2026-11-21"
  }});
  await flush();
  const writes=()=>h.requests.filter(r=>r.url.includes("careerops_job_tracking")&&r.method==="POST");
  assert.equal(writes().length,1,"Applied should not race ahead of Opened");
  assert.equal(JSON.parse(writes()[0].body).stage,"Opened");
  releaseOpened({ok:true,status:204});
  await flush();await flush();
  assert.equal(writes().length,2);
  assert.equal(JSON.parse(writes()[1].body).stage,"Applied");
  assert.equal(JSON.parse(writes()[1].body).applied_on,"2026-11-21");
});
