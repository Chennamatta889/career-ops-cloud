const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");

const source=fs.readFileSync(path.resolve(__dirname,"../app.js"),"utf8");
const markup=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
const pageKeys=["overview","discover","applications","resume","ai","activity","settings"];
function createHarness(initialHash="#overview"){
  const elements=new Map(),documentEvents=new Map(),windowEvents=new Map();
  const scrollCalls=[],urlWrites=[];
  function classList(initial=[]){
    const values=new Set(initial);
    return {
      add(x){values.add(x)},remove(x){values.delete(x)},
      contains(x){return values.has(x)},
      toggle(x,force){
        if(force===true){values.add(x);return true;}
        if(force===false){values.delete(x);return false;}
        if(values.has(x)){values.delete(x);return false;}
        values.add(x);return true;
      }
    };
  }
  function node(id){
    if(!elements.has(id)){
      const attributes=new Map(),listeners=new Map();
      const el={
        id,hidden:false,disabled:false,open:false,innerHTML:"",textContent:"",
        value:id==="matchFilter"?"all":id==="sortFilter"?"variety":"",
        dataset:{},classList:classList(),attributes,listeners,
        addEventListener(name,cb){listeners.set(name,cb)},
        getAttribute(name){return attributes.get(name)||null},
        setAttribute(name,v){attributes.set(name,String(v))},
        removeAttribute(name){attributes.delete(name)},
        querySelector(){return {innerHTML:""}},
        close(){this.open=false},showModal(){this.open=true},
        contains(){return false}
      };
      elements.set(id,el);
    }
    return elements.get(id);
  }
  const pages=pageKeys.map(id=>node("page-"+id));
  const navs=pageKeys.map(id=>{
    const n=node("nav-"+id);
    n.setAttribute("data-nav",id);
    n.classList=classList(id==="overview"?["active"]:[]);
    return n;
  });
  const location={pathname:"/career-ops-cloud/",search:"",hash:initialHash,origin:"https://chennamatta889.github.io"};
  let index=0,entries=[initialHash],pushes=0,replaces=0;
  const scroll={};
  const document={
    title:"Career-Ops",activeElement:null,
    body:{classList:classList(),appendChild(){}},
    getElementById:node,
    createElement:()=>node("temporary-element"),
    addEventListener(name,cb){documentEvents.set(name,cb)},
    querySelectorAll(query){if(query===".page")return pages;if(query===".nav-link")return navs;return []},
    querySelector(query){return query==="#page-overview .notice"?node("overviewNotice"):null}
  };
  const window={
    CareerOpsCategories:{categories:["IT & Software","Other"],classify:()=>"Other"},
    CareerOpsJobText:require("../job-text.js"),
    CareerOpsJobSearch:require("../job-search.js"),
    CareerOpsMatch:{
      rank:()=>({score:0,quality:"Limited evidence",role:{points:0,detail:"Unknown"},
        location:{points:0,detail:"Unknown"},skills:{points:0,detail:"Unknown"},
        experience:"Not provided",method:"Rule-based, not AI"}),
      groups:()=>[]
    },
    addEventListener(name,cb){
      const arr=windowEvents.get(name)||[];
      arr.push(cb);windowEvents.set(name,arr);
    },
    dispatchEvent(e){for(const cb of windowEvents.get(e.type)||[])cb(e)},
    scrollTo(v){scrollCalls.push(v)},
  };
  function navigateHistory(next){
    location.hash=next;
    window.dispatchEvent({type:"popstate"});
    window.dispatchEvent({type:"hashchange"});
  }
  const history={
    pushState(state,title,url){
      const next=String(url).slice(String(url).indexOf("#"));
      entries=entries.slice(0,index+1);entries.push(next);index++;
      location.hash=next;pushes++;urlWrites.push({method:"push",url});
    },
    replaceState(state,title,url){
      const next=String(url).slice(String(url).indexOf("#"));
      entries[index]=next;location.hash=next;replaces++;
      urlWrites.push({method:"replace",url});
    },
    back(){if(index>0){index--;navigateHistory(entries[index])}},
    forward(){if(index+1<entries.length){index++;navigateHistory(entries[index])}}
  };
  class CustomEvent{constructor(type,opts){this.type=type;this.detail=opts?.detail}}
  const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const ctx={
    document,window,history,location,localStorage,sessionStorage,
    CustomEvent,Date,URL,Blob,console,
    setTimeout:()=>1,clearTimeout(){}
  };
  ctx.fetch=()=>new Promise(()=>{}); // no network; startup feed stays pending
  vm.runInNewContext(source,ctx,{filename:"app.js"});
  function nav(name){
    const item=navs.find(x=>x.getAttribute("data-nav")===name);
    if(!item)throw Error("Unknown navigation target "+name);
    let prevented=false;
    documentEvents.get("click")({
      target:{closest(selector){return selector==="[data-nav]"?item:null}},
      preventDefault(){prevented=true}
    });
    assert.ok(prevented,"navigation intercepts anchor and button clicks");
  }
  function details(id){
    const target={getAttribute(key){
      return key==="data-action"?"details":key==="data-id"?id:null;
    }};
    documentEvents.get("click")({target:{closest(selector){
      return selector==="[data-action]"?target:null;
    }}});
  }
  return {nav,details,node,pages,navs,location,history,window,document,scrollCalls,urlWrites,
    get pushes(){return pushes},get replaces(){return replaces},get entries(){return entries.slice()},
    active(){return pages.find(x=>x.classList.contains("active"))?.id.replace("page-","")}
  };
}

test("direct page navigation pushes history instead of replacing earlier pages",()=>{
  const ui=createHarness();
  assert.equal(ui.active(),"overview");
  assert.equal(ui.pushes,0);
  ui.nav("discover");ui.nav("applications");ui.nav("resume");
  assert.equal(ui.pushes,3);
  assert.equal(ui.replaces,0);
  assert.deepEqual(ui.entries,["#overview","#discover","#applications","#resume"]);
  assert.equal(ui.document.title,"Resume & preferences | Career-Ops");
  ui.nav("resume");
  assert.equal(ui.pushes,3,"clicking active page does not duplicate history");
});
test("browser Back/Forward restores correct page, aria-current and breadcrumb without URL writes",()=>{
  const ui=createHarness();
  ui.nav("discover");ui.nav("applications");ui.nav("ai");
  const count=ui.urlWrites.length;
  const beforeScroll=ui.scrollCalls.length;
  ui.history.back();
  assert.equal(ui.active(),"applications");
  assert.equal(ui.node("currentCrumb").textContent,"My applications");
  assert.equal(ui.navs.find(n=>n.getAttribute("data-nav")==="applications").getAttribute("aria-current"),"page");
  assert.equal(ui.navs.find(n=>n.getAttribute("data-nav")==="ai").getAttribute("aria-current"),null);
  assert.equal(ui.node("page-ai").getAttribute("aria-hidden"),"true");
  ui.history.back();assert.equal(ui.active(),"discover");
  ui.history.forward();assert.equal(ui.active(),"applications");
  ui.history.forward();assert.equal(ui.active(),"ai");
  assert.equal(ui.urlWrites.length,count,"history events never push or replace URLs");
  assert.equal(ui.scrollCalls.length,beforeScroll,"Back/Forward does not force scroll to top");
});
test("deep links and invalid routes render safely without creating navigation loops",()=>{
  const deeplink=createHarness("#settings");
  assert.equal(deeplink.active(),"settings");
  assert.equal(deeplink.pushes,0);assert.equal(deeplink.replaces,0);
  const unknown=createHarness("#does-not-exist");
  assert.equal(unknown.active(),"overview");
  assert.equal(unknown.location.hash,"#overview");
  assert.equal(unknown.replaces,1);assert.equal(unknown.pushes,0);
});
test("Google OAuth access and error fragments are preserved until AI Studio consumes them",()=>{
  for(const hash of ["#access_token=private-test-token&expires_in=3600",
    "#error=access_denied&error_description=cancelled","#error_code=invalid_request"]){
    const ui=createHarness(hash);
    assert.equal(ui.active(),"ai");
    assert.equal(ui.location.hash,hash);
    assert.equal(ui.pushes,0);assert.equal(ui.replaces,0);
  }
});
test("navigating back closes open job dialogs and collapses the mobile drawer",()=>{
  const ui=createHarness();
  ui.nav("discover");ui.nav("applications");
  ui.node("jobDialog").open=true;
  ui.node("mobileMenu").listeners.get("click")();
  assert.equal(ui.node("sidebar").classList.contains("open"),true);
  assert.equal(ui.document.body.classList.contains("nav-open"),true);
  ui.history.back();
  assert.equal(ui.active(),"discover");
  assert.equal(ui.node("jobDialog").open,false);
  assert.equal(ui.node("sidebar").classList.contains("open"),false);
  assert.equal(ui.document.body.classList.contains("nav-open"),false);
});
test("Escape closes the mobile drawer without changing the page or history",()=>{
  const ui=createHarness();
  ui.node("mobileMenu").listeners.get("click")();
  const before=ui.urlWrites.length;
  ui.window.dispatchEvent({type:"keydown",key:"Escape"});
  assert.equal(ui.node("sidebar").classList.contains("open"),false);
  assert.equal(ui.urlWrites.length,before);
});

test("Workspace breadcrumb and sidebar workspace header navigate to Overview",()=>{
  assert.match(markup,/<button class="workspace-select workspace-home"[^>]*data-nav="overview"/);
  assert.match(markup,/<button class="breadcrumb breadcrumb-home"[^>]*data-nav="overview"/);
  assert.match(markup,/id="currentCrumb"[^>]*>Overview<\/strong>/);
  const ui=createHarness("#settings");
  assert.equal(ui.active(),"settings");
  // Both controls use the same delegated data-nav handler as the overview link.
  ui.nav("overview");
  assert.equal(ui.active(),"overview");
  assert.equal(ui.location.hash,"#overview");
  assert.equal(ui.pushes,1);
  ui.history.back();
  assert.equal(ui.active(),"settings");
  ui.history.forward();
  assert.equal(ui.active(),"overview");
});
test("Settings highlights account, privacy, and diagnostics; advanced tools start collapsed",()=>{
  const start=markup.indexOf('id="page-settings"');
  const end=markup.indexOf("</main>",start);
  const settings=markup.slice(start,end);
  assert.ok(start>0);
  assert.match(settings,/id="settingsAccountHeading"/);
  assert.match(settings,/id="settingsPrivacyHeading"/);
  assert.match(settings,/id="settingsAccountStatus"/);
  assert.match(settings,/id="runHealthChecks"/);
  assert.match(settings,/<details class="panel settings-advanced" id="advancedTools">/);
  assert.doesNotMatch(settings,/<details[^>]*id="advancedTools"[^>]*\bopen\b/);
  const advanced=settings.slice(settings.indexOf('id="advancedTools"'));
  for(const id of ["scanImport","importMessage","exportData","resetWorkspace"]){
    assert.match(advanced,new RegExp('id="'+id+'"'),"Expected legacy tool within advanced section: "+id);
  }
  assert.match(settings,/data-nav="ai"/);
  assert.match(settings,/data-nav="applications"/);
  assert.ok(settings.indexOf("Account settings")<settings.indexOf("Advanced tools"));
  assert.ok(settings.indexOf("Connection diagnostics")<settings.indexOf("Advanced tools"));
});
test("Settings account identity is derived from authenticated user and cleared on sign-out",()=>{
  const ui=createHarness("#settings");
  assert.equal(ui.node("settingsAccountStatus").textContent,"");
  ui.window.dispatchEvent({type:"careerops:authenticated",detail:{
    id:"11111111-1111-4111-8111-111111111111",email:"account-a@example.com"
  }});
  assert.equal(ui.node("settingsAccountStatus").textContent,"Signed in as account-a@example.com");
  assert.equal(ui.node("settingsAccountStatus").dataset.state,"connected");
  ui.window.dispatchEvent({type:"careerops:signed-out"});
  assert.match(ui.node("settingsAccountStatus").textContent,/Sign in with Google/);
  assert.equal(ui.node("settingsAccountStatus").dataset.state,"signed-out");
});

test("imported employer markup is readable in the job dialog and optional ranking is hidden",async()=>{
  const ui=createHarness("#settings");
  const raw='<p><strong>Opportunity Overview</strong></p><p>Senior Applied Scientist &nbsp; working with clinical workflows.</p><ul><li>Complex clinical document understanding</li><li>Deploying models</li></ul>';
  const data=[{
    id:"cohere-health-sample",title:"Senior Applied Scientist",company:"Cohere Health",
    location:"Remote, USA",url:"https://example.com/job/123",
    description:raw
  }];
  const listener=ui.node("scanImport").listeners.get("change");
  assert.equal(typeof listener,"function");
  const target={files:[{size:1250,name:"sample-job.json",text:async()=>JSON.stringify(data)}],value:"selected"};
  listener({target});
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  const card=ui.node("jobsGrid").innerHTML;
  assert.match(card,/Senior Applied Scientist/);
  assert.doesNotMatch(card,/&lt;p&gt;|&nbsp;|<script/);
  const id=card.match(/data-action="details"\s+data-id="([^"]+)"/)?.[1];
  assert.ok(id,"Expected details action for imported job");
  ui.details(id);
  const displayed=ui.node("dialogDescription").textContent;
  assert.match(displayed,/Opportunity Overview\n\nSenior Applied Scientist/);
  assert.match(displayed,/• Complex clinical document understanding/);
  assert.doesNotMatch(displayed,/<\/?p>|&nbsp;|\\</);
  assert.equal(ui.node("matchExplanation").hidden,true);
  assert.equal(ui.node("matchExplanation").innerHTML,"");
});
