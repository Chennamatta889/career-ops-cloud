const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const script=fs.readFileSync(path.resolve(__dirname,"../health-check.js"),"utf8");
const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
function harness({signedIn=true,failVault=false}={}){
  const elements=new Map(),calls=[];
  const element=()=>{
    const obj={textContent:"",className:"",disabled:false,dataset:{},children:[],
      listeners:new Map(),
      addEventListener(n,cb){this.listeners.set(n,cb)},
      append(...els){this.children.push(...els)},
      replaceChildren(...els){this.children=[...els]}
    };
    return obj;
  };
  const el=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const doc={getElementById:el,createElement:element};
  const window={CAREEROPS_PRIVATE_CONFIG:{
    supabaseUrl:"https://nnhzihcugvifhegsfmua.supabase.co",
    publishableKey:"sb_publishable_test_public_key_not_secret_123456"
  },CareerOpsAuth:{getAccessToken:async()=>signedIn?"mock-user-jwt":null},
  CareerOpsResumeParser:{parseFile:()=>Promise.resolve({text:"fake resume"})}};
  const fetch=async(url,options={})=>{
    calls.push({url:String(url),method:options.method||"GET",headers:options.headers||{},body:options.body});
    if(String(url).includes("vendor/"))return {ok:true,status:200};
    if(String(url).includes("data/jobs.json"))return {ok:true,json:async()=>({
      schema:"careerops.public-jobs.v1",jobs:[],scan:{status:"success"}
    })};
    if(String(url).includes("/auth/v1/settings"))return {ok:true,json:async()=>({external:{google:true}})};
    if(String(url).includes("/auth/v1/user"))return {ok:true,json:async()=>({id:"12345678-1234-4123-8123-123456789abc"})};
    if(String(url).includes("/rest/v1/careerops_resume_vault")&&failVault)return {ok:false,status:403};
    if(String(url).includes("/rest/v1/"))return {ok:true,json:async()=>[]};
    if(String(url).includes("/functions/v1/careerops-ai-review")){
      assert.equal(JSON.parse(options.body).action,"status","No billable Gemini request");
      return {ok:true,json:async()=>({ok:true,ready:true})};
    }
    throw Error("Unexpected endpoint "+url);
  };
  const ctx={window,document:doc,fetch,AbortSignal,Date};
  vm.runInNewContext(script,ctx,{filename:"health-check.js"});
  return {calls,el,click:()=>el("runHealthChecks").listeners.get("click")()};
}
test("Health checks never run automatically or generate AI content",async()=>{
  const h=harness();assert.equal(h.calls.length,0);
  await h.click();
  assert.equal(h.calls.filter(c=>c.url.includes("/functions/v1/")).length,1);
  assert.ok(h.calls.every(c=>c.method!=="POST"||JSON.parse(c.body).action==="status"));
  assert.ok(h.calls.every(c=>!c.body||!String(c.body).includes("resume_text")));
  assert.match(h.el("healthSummary").textContent,/7 checks passed/);
});
test("Anonymous users see 3 public checks and 4 skipped private checks",async()=>{
  const h=harness({signedIn:false});await h.click();
  assert.match(h.el("healthSummary").textContent,/3 checks passed/);
  assert.equal(h.calls.filter(c=>c.url.includes("/rest/v1/")).length,0);
  assert.equal(h.calls.filter(c=>c.url.includes("/functions/v1/")).length,0);
  assert.equal(h.el("healthResults").children.length,7);
});
test("Private storage authorization failure is surfaced, never hidden",async()=>{
  const h=harness({failVault:true});await h.click();
  assert.match(h.el("healthSummary").textContent,/1 failed/);
  assert.ok(h.el("healthResults").children.some(c=>c.dataset.state==="fail"));
});
test("Diagnostic interface is accessible and has no credentials in public source",()=>{
  assert.match(html,/id="runHealthChecks"/);
  assert.match(html,/id="healthResults"/);
  assert.match(html,/src="\.\/health-check\.js"/);
  assert.doesNotMatch(script,/service_role|sb_secret_|GEMINI_API_KEY|resume_text:|signInWithOtp|signInWithOAuth/);
});
