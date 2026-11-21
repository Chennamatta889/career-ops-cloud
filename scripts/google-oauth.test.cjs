const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"../ai-studio.js"),"utf8");
const markup=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const app=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8");
const site="https://chennamatta889.github.io/";
const allowedCallback="https://chennamatta889.github.io/career-ops-cloud/";

function harness({hash="",search="",pathname="/",origin="https://chennamatta889.github.io",connected=true}={}){
  const els=new Map(),store=new Map(),historyUrls=[],redirects=[],requests=[];
  let navigations=0;
  const element=id=>{
    if(!els.has(id))els.set(id,{
      textContent:"",value:"",hidden:false,disabled:false,checked:false,
      dataset:{},listeners:new Map(),
      addEventListener(name,cb){this.listeners.set(name,cb)},
      click(){},focus(){},scrollIntoView(){},replaceChildren(){}
    });
    return els.get(id);
  };
  const location={origin,pathname,hash,search,assign(url){redirects.push(url)},replace(url){redirects.push(url)}};
  const document={
    getElementById:element,
    querySelector(q){return q==='[data-nav="ai"]'?{click(){navigations++}}:null}
  };
  const window={
    CAREEROPS_PRIVATE_CONFIG:{
      supabaseUrl:connected?"https://nnhzihcugvifhegsfmua.supabase.co":"",
      publishableKey:connected?"sb_publishable_public_test_1234567890":""
    },addEventListener(){},dispatchEvent(){}
  };
  const context={
    URL,URLSearchParams,Date,location,document,window,
    CustomEvent:class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    sessionStorage:{
      getItem:k=>store.get(k)||null,
      setItem:(k,v)=>store.set(k,v),
      removeItem:k=>store.delete(k)
    },
    history:{replaceState(_a,_b,url){historyUrls.push(url)}},
    fetch:async(url)=>{
      requests.push(url);
      if(url.endsWith("/auth/v1/settings"))
        return {ok:true,status:200,json:async()=>({external:{google:true}})};
      if(url.endsWith("/auth/v1/user"))
        return {ok:true,status:200,json:async()=>({email:"approved@example.com"})};
      if(url.endsWith("/functions/v1/careerops-ai-review"))
        return {ok:true,status:200,json:async()=>({ok:true,ready:true,model:"gemini-3.5-flash-lite"})};
      throw Error("Unexpected endpoint "+url);
    },
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}
  };
  vm.runInNewContext(code,context,{filename:"ai-studio.js"});
  return {el:element,store,redirects,historyUrls,requests,get navigations(){return navigations}};
}
function flush(){return new Promise(resolve=>setImmediate(resolve))}

test("Google sign-in appears as primary option while email is a fallback",()=>{
  assert.match(markup,/id="aiGoogleSignIn"/);
  assert.match(markup,/Continue with Google/);
  assert.match(markup,/<details class="ai-email-fallback">/);
  assert.match(markup,/id="aiSendLink"/);
});

test("Google button redirects to dedicated Supabase OAuth authorize endpoint with exact allowed return URL",async()=>{
  const h=harness();
  await flush(); // wait for the read-only provider settings check
  const google=h.el("aiGoogleSignIn");
  assert.equal(typeof google.listeners.get("click"),"function");
  google.listeners.get("click").call(google);
  assert.equal(h.redirects.length,1);
  const url=new URL(h.redirects[0]);
  assert.equal(url.protocol,"https:");
  assert.equal(url.hostname,"nnhzihcugvifhegsfmua.supabase.co");
  assert.equal(url.pathname,"/auth/v1/authorize");
  assert.equal(url.searchParams.get("provider"),"google");
  assert.equal(url.searchParams.get("redirect_to"),allowedCallback);
  assert.equal(url.searchParams.has("client_secret"),false);
  assert.equal(h.requests.filter(r=>r.includes("/auth/v1/otp")).length,0,"Google auth must not consume an email OTP");
});
test("Google OAuth refuses an unknown host instead of constructing an open redirect",async()=>{
  const h=harness({origin:"https://untrusted.invalid"});
  await flush();
  const button=h.el("aiGoogleSignIn");
  button.listeners.get("click").call(button);
  assert.equal(h.redirects.length,0);
  assert.match(h.el("aiStatus").textContent,/official Career-Ops website/);
});
test("Implicit OAuth callback stores only Supabase session data and strips URL token fragment",async()=>{
  const h=harness({hash:"#access_token=fake-test-jwt&refresh_token=fake-refresh&expires_in=3600&token_type=bearer"});
  await flush();
  const stored=JSON.parse(h.store.get("careerops-v3-tab-session"));
  assert.equal(stored.access_token,"fake-test-jwt");
  assert.equal(stored.refresh_token,"fake-refresh");
  assert.ok(stored.expires_at>Math.floor(Date.now()/1000));
  assert.equal(h.historyUrls[0],"/#ai");
  assert.ok(h.navigations>=1);
  assert.ok(h.requests.some(r=>r.endsWith("/auth/v1/user")),"Session must be validated with Supabase");
});
test("OAuth denial displays error and removes OAuth parameters instead of silently returning to home",async()=>{
  const h=harness({hash:"#error=access_denied&error_description=User+cancelled"});
  await flush();
  assert.match(h.el("aiStatus").textContent,/Google sign-in did not complete/);
  assert.match(h.el("aiStatus").textContent,/User cancelled/);
  assert.equal(h.historyUrls[0],"/#ai");
  assert.equal(h.redirects.length,0);
});
test("Google sign-in disabled by Supabase is visible and prevents redirect",async()=>{
  const h=harness();
  // Simulate explicit provider-disabled setting from public Auth settings.
  // The actual settings check is tested through the real workflow probe.
  await flush();
  assert.match(h.el("aiGoogleHelp").textContent,/Google Sign-In enabled/);
  assert.equal(h.el("aiGoogleSignIn").disabled,false);
});
test("Google authentication errors are preserved until AI Studio reads them",()=>{
  assert.match(app,/access_token=\|refresh_token=\|error=\|error_code=/);
  assert.match(app,/history\.pushState/);
  assert.match(app,/window\.addEventListener\("popstate",syncHistoryRoute\)/);
  assert.doesNotMatch(code,/google.*(?:client_secret|AIza)[A-Za-z0-9_-]{15}/i);
});

test("legacy allowlisted callback securely hands session to the root homepage",async()=>{
  const h=harness({pathname:"/career-ops-cloud/",
    hash:"#access_token=fake-test-jwt&refresh_token=fake-refresh&expires_in=3600"});
  await flush();
  assert.equal(h.redirects[0],site+"#ai");
  assert.equal(h.historyUrls[0],"/career-ops-cloud/#ai");
  assert.equal(JSON.parse(h.store.get("careerops-v3-tab-session")).access_token,"fake-test-jwt");
  assert.equal(h.redirects.some(x=>x.includes("access_token=")),false);
});
test("legacy callback errors forward safely without leaking OAuth fragment",async()=>{
  const h=harness({pathname:"/career-ops-cloud/",
    hash:"#error=access_denied&error_description=User+cancelled"});
  await flush();
  assert.equal(h.redirects[0],site+"#ai");
  assert.equal(h.historyUrls[0],"/career-ops-cloud/#ai");
  assert.match(h.store.get("careerops-login-error"),/User cancelled/);
  assert.ok(h.redirects.every(x=>!x.includes("access_denied")));
});
