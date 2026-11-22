const test=require("node:test");
const assert=require("node:assert/strict");
const search=require("../job-search.js");
const categories=require("../job-categories.js");
const text=require("../job-text.js");
for(const [query,title] of [[".NET","ASP.NET Developer"],["dotnet",".NET Engineer"],["C#","C# Developer"],["java","Java Developer"],["selenium","Selenium QA Engineer"]]){
  test("tech search: "+query+" matches "+title,()=>assert.equal(search.evaluate({title},query).matches,true));
}
test("QA and .NET roles classify as IT",()=>{
  for(const title of ["Manual Tester","SDET","Java Developer",".NET Developer","Selenium Tester"])
    assert.equal(categories.classify(title),"IT & Software");
});
test("graduate title without years is not a confirmed zero-experience role",()=>{
  const entry=text.entryOpportunity({title:"Graduate Engineer Trainee"});
  assert.notEqual(entry.level,"fresher");
});
test("explicit senior experience is never fresher",()=>{
  assert.equal(text.entryOpportunity({title:"Graduate Engineer",requiredExperience:"5+ years"}).level,"unknown");
});
