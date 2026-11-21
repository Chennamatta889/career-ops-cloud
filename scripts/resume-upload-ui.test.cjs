const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"../ai-studio.js"),"utf8");
const appSource=fs.readFileSync(path.resolve(__dirname,"../app.js"),"utf8");

function harness(parser){
  const elements=new Map();
  const windowListeners=new Map();
  let navigation=0;
  let scrolls=0;
  const makeElement=id=>({
    id,value:"",textContent:"",checked:false,disabled:false,hidden:false,
    dataset:{},
    files:[],
    listeners:new Map(),
    addEventListener(event,handler){this.listeners.set(event,handler);},
    scrollIntoView(){scrolls++},
    focus(){},
    click(){}
  });
  function el(id){
    if(!elements.has(id))elements.set(id,makeElement(id));
    return elements.get(id);
  }
  const fakeWindow={
    CAREEROPS_PRIVATE_CONFIG:{supabaseUrl:"",publishableKey:""},
    CareerOpsResumeParser:parser,
    addEventListener(type,callback){
      const old=windowListeners.get(type)||[];
      old.push(callback);windowListeners.set(type,old);
    },
    dispatchEvent(ev){
      const listeners=windowListeners.get(ev.type)||[];
      for(const fn of listeners)fn(ev);
      return true;
    }
  };
  const document={
    getElementById:el,
    querySelector(s){
      if(s==='[data-nav="ai"]')return {click(){navigation++}};
      return null;
    }
  };
  class CustomEvent{
    constructor(type,init={}){this.type=type;this.detail=init.detail;}
  }
  const context={
    window:fakeWindow,document,CustomEvent,
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    location:{hash:"",pathname:"/",search:"",origin:"https://test.invalid"},
    history:{replaceState(){}},
    setTimeout,clearTimeout,setInterval,clearInterval
  };
  vm.runInNewContext(source,context,{filename:"ai-studio.js"});
  return {el,dispatch:fakeWindow.dispatchEvent.bind(fakeWindow),get navigation(){return navigation},get scrolls(){return scrolls}};
}
function nextTurn(){return new Promise(resolve=>setImmediate(resolve));}
const sampleResume="AWS Linux Jenkins Kubernetes Docker Terraform deployment pipeline incident response. ".repeat(6);

test("Resume Lab selection immediately opens AI Studio and visibly extracts text",async()=>{
  let finish;
  const p=new Promise(resolve=>{finish=resolve;});
  const h=harness({parseFile:()=>p});
  const file={name:"resume.pdf",size:1800};
  h.dispatch({type:"careerops:resume-selected",detail:{file}});
  assert.equal(h.navigation,1,"AI Studio must open BEFORE extraction finishes");
  assert.equal(h.el("aiResumeParseStatus").dataset.state,"loading");
  assert.match(h.el("aiResumeParseStatus").textContent,/Processing resume.pdf locally/);
  assert.ok(h.scrolls>0,"the upload status must be scrolled into view");
  finish({text:sampleResume,filename:"resume.pdf",notes:[]});
  await nextTurn();
  assert.equal(h.el("aiResume").value,sampleResume);
  assert.equal(h.el("aiResumeParseStatus").dataset.state,"success");
  assert.match(h.el("aiResumeParseStatus").textContent,/characters from resume.pdf/);
  assert.match(h.el("aiStatus").textContent,/Resume ready/);
});
test("PDF parse errors remain visible after navigation and do not silently disappear",async()=>{
  const h=harness({parseFile:async()=>{throw Error("No readable text was extracted; scanned PDF.");}});
  h.dispatch({type:"careerops:resume-selected",detail:{file:{name:"scan.pdf",size:4000}}});
  await nextTurn();
  assert.equal(h.navigation,1);
  assert.equal(h.el("aiResumeParseStatus").dataset.state,"error");
  assert.match(h.el("aiResumeParseStatus").textContent,/scanned PDF/);
  assert.match(h.el("aiStatus").textContent,/reason is shown/);
});
test("AI Studio file input remains intact until parsing ends on mobile",async()=>{
  let finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  const h=harness({parseFile:()=>pending});
  const input=h.el("aiResumeTxtFile");
  input.files=[{name:"my-resume.docx",size:1000}];
  input.value="selected-file";
  const event=input.listeners.get("change")();
  assert.equal(h.navigation,1);
  assert.equal(input.value,"selected-file","file handle must survive async imports");
  assert.equal(input.disabled,true);
  finish({text:sampleResume,filename:"my-resume.docx",notes:[]});
  await event;
  assert.equal(input.value,"");
  assert.equal(input.disabled,false);
  assert.equal(h.el("aiResumeParseStatus").dataset.state,"success");
});
test("Resume Lab does not clear the input before receiving extraction result",()=>{
  const sourceStart=appSource.indexOf('$("resumeFile").addEventListener("change"');
  const sourceEnd=appSource.indexOf('$("scanImport").addEventListener',sourceStart);
  assert.ok(sourceStart>=0&&sourceEnd>sourceStart);
  const snippet=appSource.slice(sourceStart,sourceEnd);
  assert.match(snippet,/careerops:resume-selected/);
  assert.match(snippet,/careerops:resume-parse-result/);
  assert.match(snippet,/resumeFile"\)\.value=""/);
  assert.ok(snippet.indexOf('resume-parse-result')<snippet.indexOf('resumeFile").value=""'));
});
