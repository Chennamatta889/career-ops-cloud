const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const script=fs.readFileSync(path.join(__dirname,"../ai-studio.js"),"utf8");

function harness(response,sharedStore) {
  const store=sharedStore || new Map();
  const ui=new Map();
  const element=id=>{
    if(!ui.has(id))ui.set(id,{
      id,value:"",textContent:"",disabled:false,hidden:false,checked:false,
      listeners:new Map(),dataset:{},
      addEventListener(type,callback){this.listeners.set(type,callback);},
      click(){},replaceChildren(){},scrollIntoView(){},focus(){}
    });
    return ui.get(id);
  };
  let requestCount=0;
  const fetcher=async(url,options)=>{
    if(String(url).endsWith("/auth/v1/settings")) {
      return {ok:true,status:200,json:async()=>({external:{google:true}})};
    }
    requestCount++;
    assert.ok(String(url).includes("/auth/v1/otp"));
    assert.equal(options.method,"POST");
    return {ok:response.ok,status:response.status,json:async()=>response.body};
  };
  const window={CAREEROPS_PRIVATE_CONFIG:{
    supabaseUrl:"https://exampleproject.supabase.co",
    publishableKey:"sb_publishable_testing_example_that_is_public"
  },addEventListener(){},dispatchEvent(){}};
  const ctx={document:{
    getElementById:element,
    querySelector:()=>null
  },window,fetch:fetcher,
  localStorage:{
    getItem:key=>store.get(key)||null,
    setItem:(key,val)=>store.set(key,val),
    removeItem:key=>store.delete(key)
  },sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  location:{hash:"",origin:"https://chennamatta889.github.io",pathname:"/",search:""},
  history:{replaceState(){}},
  // no real timers; cooldown UI still renders immediately
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
  Date, URL, URLSearchParams,
  CustomEvent:class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail}}
  };
  vm.runInNewContext(script,ctx,{filename:"ai-studio.js"});
  const button=element("aiSendLink");
  element("aiEmail").value="test@example.com";
  return {button,el:element,store,get requests(){return requestCount},click:()=>button.listeners.get("click").call(button)};
}
test("server 429 email quota disables resend and explains recovery",async()=>{
  const h=harness({ok:false,status:429,body:{code:"over_email_send_rate_limit",msg:"email rate limit exceeded"}});
  await h.click();
  assert.equal(h.requests,1);
  assert.equal(h.button.disabled,true);
  assert.match(h.button.textContent,/Try again in/);
  assert.match(h.el("aiEmailCooldown").textContent,/two emails per hour/i);
  assert.match(h.el("aiStatus").textContent,/email quota reached/i);
  const next=h.store.get("careerops-auth-email-next-request-v1");
  assert.ok(Number(next)>Date.now()+59*60*1000);
  await h.click();
  assert.equal(h.requests,1,"repeat click must not call Supabase while throttled");
});
test("successful email link requests pause resends without storing credentials",async()=>{
  const h=harness({ok:true,status:200,body:{}});
  await h.click();
  assert.equal(h.requests,1);
  assert.match(h.el("aiStatus").textContent,/Sign-in email requested/);
  assert.equal(h.button.disabled,true);
  const entries=[...h.store.entries()];
  assert.equal(entries.length,1);
  assert.match(entries[0][0],/next-request/);
  assert.match(entries[0][1],/^\d+$/);
  assert.ok(Number(entries[0][1])>Date.now()+60000);
});
test("cooldown persists across a page refresh without storing any session token",async()=>{
  const shared=new Map([["careerops-auth-email-next-request-v1",String(Date.now()+60*60*1000)]]);
  const h=harness({ok:true,status:200,body:{}},shared);
  assert.equal(h.button.disabled,true);
  await h.click();
  assert.equal(h.requests,0);
  assert.match(h.el("aiEmailCooldown").textContent,/No new email requests/);
});
test("unexpected email errors do not block all sign-in attempts for an hour",async()=>{
  const h=harness({ok:false,status:400,body:{error:"invalid email address"}});
  await h.click();
  assert.equal(h.requests,1);
  assert.equal(h.button.disabled,false);
  assert.match(h.el("aiStatus").textContent,/invalid email address/i);
});
