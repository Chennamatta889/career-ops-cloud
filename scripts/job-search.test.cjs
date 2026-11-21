const test=require("node:test");
const assert=require("node:assert/strict");
const {normalize,evaluate}=require("../job-search.js");
const now={title:"ServiceNow Developer",company:"IT Services",location:"India",
  description:"Build ServiceNow workflows, integrations and ITSM processes.",department:"Engineering",skills:[]};
const sf={title:"Salesforce Developer",company:"CRM Company",location:"Remote",
  description:"Salesforce CRM integration with ServiceNow tickets; ServiceNow is mentioned as an external tool.",
  department:"Engineering",skills:[]};
test("default role-focused search must not return Salesforce jobs from incidental ServiceNow mentions",()=>{
  assert.equal(evaluate(now,"ServiceNow").matches,true);
  assert.equal(evaluate(sf,"ServiceNow").matches,false);
  assert.equal(evaluate(sf,"Salesforce").matches,true);
  assert.equal(evaluate(now,"Salesforce").matches,false);
});
test("description matching requires deliberate user opt-in and remains lower relevance than job title",()=>{
  const jobTitle=evaluate(now,"ServiceNow",{includeDescription:true});
  const onlyDescription=evaluate(sf,"ServiceNow",{includeDescription:true});
  assert.equal(onlyDescription.matches,true);
  assert.equal(onlyDescription.source,"description");
  assert.ok(jobTitle.score>onlyDescription.score,"the title match must sort before incidental tool mentions");
});
test("role, employer, department, job skills and location remain searchable",()=>{
  const job={title:"Platform Engineer",company:"Example Co",department:"Infrastructure",
    skills:["AWS","Jenkins","Docker"],location:"Hyderabad",description:"Some general role"};
  for(const term of ["platform","example","infrastructure","aws","JENKINS","hyderabad"])
    assert.equal(evaluate(job,term).matches,true,term);
  assert.equal(evaluate(job,"servicenow").matches,false);
});
test("AND search uses whole words with punctuation and joined brand spellings",()=>{
  const role={title:"Service Now Platform Engineer",company:"One Inc",description:"",skills:["AWS"]};
  assert.equal(evaluate(role,"ServiceNow AWS").matches,true);
  assert.equal(evaluate(role,"servicenow, aws").matches,true);
  assert.equal(evaluate(role,"service now AWS").matches,true);
  assert.equal(evaluate(role,"service").matches,false,"avoid partial matches on ServiceNow");
  assert.equal(evaluate(role,"salesforce").matches,false);
  assert.equal(evaluate(role,"ServiceNow Terraform").matches,false);
  assert.equal(normalize("  SALES   FORCE "), "salesforce");
});
test("empty search never blocks ordinary categories and filtering",()=>{
  assert.equal(evaluate(sf,"").matches,true);
  assert.equal(evaluate(sf,"!!!").score,0);
});
