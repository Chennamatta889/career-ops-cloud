/* Read-only Phase 4.5 post-deploy website verification.
 * Calls only public GitHub Pages paths and an unauthenticated status request.
 * Never creates a user, accesses private records or invokes Gemini.
 */
const site="https://chennamatta889.github.io/career-ops-cloud/";
const supabase="https://nnhzihcugvifhegsfmua.supabase.co";
const checks=[
  {path:"",contains:'id="runHealthChecks"'},
  {path:"app.js",contains:"ACCOUNT_STORAGE_PREFIX"},
  {path:"job-categories.js",contains:"CareerOpsCategories"},
  {path:"ai-studio.js",contains:"jobFetchVersion"},
  {path:"private-workspace.js",contains:"accountVersion"},
  {path:"health-check.js",contains:"runHealthChecks"},
  {path:"resume-parser.js",contains:"CareerOpsResumeParser"},
  {path:"data/jobs.json",json:true},
  {path:"vendor/pdf.min.mjs",head:true},
  {path:"vendor/pdf.worker.min.mjs",head:true},
  {path:"vendor/mammoth.browser.min.js",head:true}
];
async function check(item){
  const r=await fetch(site+item.path,{
    method:item.head?"HEAD":"GET",
    cache:"no-store",
    signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw Error((item.path||"index.html")+" returned HTTP "+r.status);
  if(item.head)return;
  if(item.json){
    const data=await r.json();
    if(data.schema!=="careerops.public-jobs.v1" || !Array.isArray(data.jobs) || !data.category_counts)
      throw Error("Public feed JSON has invalid schema.");
    console.log("All-role postings:",data.jobs.length,"employer boards:",data.scan?.scanned,"categories:",JSON.stringify(data.category_counts),"scan:",data.scan?.status);
  }else{
    const source=await r.text();
    if(!source.includes(item.contains))throw Error((item.path||"index.html")+" does not contain the latest version.");
  }
}
let allOkay=false;
for(let attempt=1;attempt<=4;attempt++){
  try{
    await Promise.all(checks.map(check));
    allOkay=true;
    break;
  }catch(e){
    console.warn("Pages visibility check",attempt,"failed:",String(e?.message||e).slice(0,250));
    if(attempt<4)await new Promise(resolve=>setTimeout(resolve,4000));
  }
}
if(!allOkay)throw Error("Latest Career-Ops static assets are not visible on deployed GitHub Pages.");
// The private endpoint must refuse unauthenticated access. No candidate input,
// credentials, or Gemini request is ever sent by this check.
const unauthorized=await fetch(supabase+"/functions/v1/careerops-ai-review",{
  method:"POST",
  headers:{"Origin":"https://chennamatta889.github.io","Content-Type":"application/json"},
  body:JSON.stringify({action:"status"}),
  signal:AbortSignal.timeout(12000)
});
if(unauthorized.ok)throw Error("Private AI endpoint unexpectedly allowed unauthenticated request.");
console.log("Private AI endpoint rejected anonymous access with HTTP",unauthorized.status);
console.log("Phase 4.5 public deployment smoke test: PASSED.");
