const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ui=require("../enterprise-careers.js");
const policy=require("../enterprise-connector-policy.cjs");
const data=JSON.parse(fs.readFileSync(path.join(__dirname,"../enterprise-careers.json"),"utf8"));
const sources=JSON.parse(fs.readFileSync(path.join(__dirname,"./universal-job-sources.json"),"utf8")).sources;
test("Phase 10B includes all 13 requested MNC and product-company official career portals",()=>{
  assert.equal(data.schema,"careerops.enterprise-careers.v1");
  assert.equal(data.companies.length,13);
  const expected=["TCS","Accenture","Wipro","Infosys","IBM","Capgemini","Google","Microsoft",
    "Amazon / AWS","Oracle","Adobe","ServiceNow","Atlassian"];
  assert.deepEqual(data.companies.map(x=>x.name),expected);
  assert.equal(data.companies.filter(x=>x.group==="IT services").length,6);
  assert.equal(data.companies.filter(x=>x.group==="Product companies").length,7);
  assert.equal(new Set(data.companies.map(x=>x.id)).size,13);
  assert.equal(new Set(data.companies.map(x=>x.url)).size,13);
});
test("Only allow HTTPS and exact confirmed official company domains",()=>{
  for(const p of data.companies){
    assert.equal(ui.isOfficial(p),true,p.name);
    assert.equal(p.method,"official_portal");
    assert.ok(new URL(p.url).hostname===ui.officialHosts[p.id]);
    assert.equal(Object.hasOwn(p,"jobs"),false,"not an invented job list");
    assert.equal(Object.hasOwn(p,"job_count"),false,"not an invented count");
    assert.equal(Object.hasOwn(p,"posted_at"),false,"not a fabricated posting");
  }
  const tcs=data.companies[0];
  for(const url of [
    "http://www.tcs.com/careers/india","https://www.tcs.com.evil.example/jobs",
    "https://not-tcs.example/jobs","javascript:alert(1)",
    "https://user:password@www.tcs.com/careers"
  ])assert.equal(ui.isOfficial({...tcs,url}),false,url);
});
test("Company directories search independently of real job cards and preserve company grouping",()=>{
  const all=ui.select(data.companies);
  assert.equal(all.length,13);
  assert.deepEqual(ui.select(data.companies,"AWS").map(x=>x.name),["Amazon / AWS"]);
  assert.deepEqual(ui.select(data.companies,"Infosys").map(x=>x.name),["Infosys"]);
  assert.equal(ui.select(data.companies,"product","IT services").length,0);
  assert.equal(ui.select(data.companies,"","Product companies").length,7);
  assert.equal(ui.select(data.companies,"","IT services").length,6);
  assert.equal(ui.select(data.companies,"notarealcompany").length,0);
});
test("Workday, SuccessFactors, Oracle Recruiting and custom employer portals require explicit permission",()=>{
  for(const provider of ["workday","successfactors","oracle_recruiting","employer_specific"]){
    const decision=policy.classify({provider,slug:"example",name:"Example"});
    assert.equal(decision.liveEligible,false,provider);
    assert.equal(policy.eligibleForPublicScan({provider,slug:"example",name:"Example"}),false);
  }
  for(const provider of ["greenhouse","ashby","lever"]){
    assert.equal(policy.eligibleForPublicScan({provider,slug:"realboard",name:"Real Board"}),true);
    assert.equal(policy.eligibleForPublicScan({provider,slug:"https://attacker.example",name:"Fake"}),false);
  }
  assert.equal(policy.classify({provider:"unknown"}),null);
});
test("Product-company public boards use real supported ATS adapters, not guessed MNC slugs",()=>{
  const expected=[["GitLab","greenhouse","gitlab"],["Canonical","greenhouse","canonical"],
    ["Cloudflare","greenhouse","cloudflare"],["Braze","greenhouse","braze"],
    ["1Password","ashby","1password"],["Crusoe","ashby","Crusoe"]];
  for(const [name,provider,slug] of expected){
    assert.ok(sources.some(s=>s.name===name&&s.provider===provider&&s.slug===slug),name);
  }
  for(const firm of data.companies){
    if(firm.name==="ServiceNow"){
      assert.ok(sources.some(s=>s.name==="ServiceNow"&&s.provider==="smartrecruiters"&&s.slug==="ServiceNow"),
        "ServiceNow uses a verified official SmartRecruiters public employer board");
      continue;
    }
    assert.equal(sources.some(s=>s.name.toLowerCase()===firm.name.toLowerCase()),false,
      "Do not impersonate "+firm.name+" as a supported ATS board");
  }
  assert.ok(sources.length>=79);
});
test("Phase 10B portal module does not auto-apply or store candidate data",()=>{
  const js=fs.readFileSync(path.join(__dirname,"../enterprise-careers.js"),"utf8");
  assert.doesNotMatch(js,/\b(?:localStorage|sessionStorage|sendMail|submitApplication|uploadResume)\s*\(/);
  assert.doesNotMatch(js,/\/wday\/cxs\/|careersection\/rest\/|odata\/v2|recruitingJobRequisitions/);
  assert.match(js,/noopener noreferrer/);
  const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
  for(const id of ["enterpriseCareerDirectory","enterpriseCareerSearch","enterpriseCareerKind",
    "enterpriseCareerCards","enterpriseCareerStatus"])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/These are official career-page links, not job applications/);
  assert.match(html,/enterprise-careers\.js/);
});
