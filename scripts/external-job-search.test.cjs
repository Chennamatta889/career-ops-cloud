const test=require("node:test");
const assert=require("node:assert/strict");
const {links}=require("../external-job-search.js");
test("empty query links to official Indian portal landing pages",()=>{
  assert.deepEqual(links("",null),{
    naukri:"https://www.naukri.com/",
    linkedin:"https://www.linkedin.com/jobs/",
    indeed:"https://in.indeed.com/"
  });
});
test("role and Indian location appear as encoded URL parameters on provider-owned domains",()=>{
  const results=links("DevOps & Cloud", "hyderabad");
  const expected={
    naukri:{host:"www.naukri.com",param:"keyword",loc:"location"},
    linkedin:{host:"www.linkedin.com",param:"keywords",loc:"location"},
    indeed:{host:"in.indeed.com",param:"q",loc:"l"}
  };
  for(const [provider,details] of Object.entries(expected)){
    const url=new URL(results[provider]);
    assert.equal(url.protocol,"https:");
    assert.equal(url.host,details.host);
    assert.equal(url.searchParams.get(details.param),"DevOps & Cloud");
    assert.equal(url.searchParams.get(details.loc),"Hyderabad, Telangana, India");
  }
});
test("unusual keywords cannot change the external destinations or add extra query parameters",()=>{
  const results=links("SRE &l=Overseas #jobs ?q=admin", "india");
  for(const [provider,target] of Object.entries({naukri:"www.naukri.com",linkedin:"www.linkedin.com",indeed:"in.indeed.com"})){
    const url=new URL(results[provider]);
    assert.equal(url.hostname,target);
    assert.equal(url.hash,"");
    assert.equal([...url.searchParams.keys()].length,2);
    assert.match(url.href,/SRE/);
  }
});
test("all existing India location choices have safe fallbacks",()=>{
  for(const place of ["india","remote","hyderabad","bengaluru","mumbai","delhi","pune","chennai","unspecified"]){
    const urls=links("SRE",place);
    assert.match(urls.indeed,/^https:\/\/in\.indeed\.com\/jobs\?/);
  }
});
