/* Read-only Phase 4.5 post-deploy website verification.
 * Calls only public GitHub Pages paths and an unauthenticated status request.
 * Never creates a user, accesses private records or invokes Gemini.
 */
import {createRequire} from "node:module";
const {isIndiaLocation}=createRequire(import.meta.url)("../india-jobs.js");
import {MAX_JOB_AGE_DAYS,cutoffDay,hasRecentDate} from "./job-freshness.mjs";
const site="https://chennamatta889.github.io/career-ops-cloud/";
const supabase="https://nnhzihcugvifhegsfmua.supabase.co";
const checks=[
  {path:"",contains:'id="runHealthChecks"'},
  {path:"",contains:'id="advancedTools"'},
  {path:"",contains:'id="applicationFollowup"'},
  {path:"",contains:'id="confirmAppliedDate"'},
  {path:"",contains:'id="enterpriseCareerDirectory"'},
  {path:"",contains:'id="enterpriseCareerCards"'},
  {path:"",contains:'class="breadcrumb breadcrumb-home"'},
  {path:"",contains:'class="workspace-select workspace-home"'},
  {path:"app.js",contains:"ACCOUNT_STORAGE_PREFIX"},
  {path:"app.js",contains:"recordEmployerOpen"},
  {path:"job-categories.js",contains:"CareerOpsCategories"},
  {path:"india-jobs.js",contains:"CareerOpsIndiaJobs"},
  {path:"job-text.js",contains:"CareerOpsJobText"},
  {path:"job-text.js",contains:"entryOpportunity"},
  {path:"",contains:'id="showFresherJobs"'},
  {path:"enterprise-careers.js",contains:"CareerOpsEnterpriseCareers"},
  {path:"ai-studio.js",contains:"jobFetchVersion"},
  {path:"private-workspace.js",contains:"accountVersion"},
  {path:"private-workspace.js",contains:"pendingTrackingWrites"},
  {path:"health-check.js",contains:"runHealthChecks"},
  {path:"resume-parser.js",contains:"CareerOpsResumeParser"},
  {path:"data/jobs.json",json:true},
  {path:"data/enterprise-careers.json",portal:true},
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
  if(item.portal){
    const data=await r.json();
    if(data.schema!=="careerops.enterprise-careers.v1"||
      !Array.isArray(data.companies)||data.companies.length!==13||
      data.companies.some(x=>x.method!=="official_portal"||!x.url.startsWith("https://")))
      throw Error("Official career directory schema or entries invalid");
    console.log("Official employer career portal links:",data.companies.length);
  }else if(item.json){
    const data=await r.json();
    if(data.schema!=="careerops.public-jobs.v1" || !Array.isArray(data.jobs) || !data.category_counts)
      throw Error("Public feed JSON has invalid schema.");
    if(data.market!=="IN"||data.scan?.india_only!==true ||
       data.jobs.some(job=>!isIndiaLocation(job?.location)))
      throw Error("Published job feed contains non-India or unverified locations.");
    if(data.scan?.max_job_age_days!==MAX_JOB_AGE_DAYS ||
       data.scan?.date_cutoff_utc!==cutoffDay() ||
       data.jobs.some(job=>!hasRecentDate(job)))
      throw Error("Published job feed contains old, future or unverified job ages.");
    const levels=data.scan?.entry_opportunities;
    if(!levels||!Number.isSafeInteger(levels.fresher)||
       !Number.isSafeInteger(levels.early_career)||
       !Number.isSafeInteger(levels.unspecified_or_other)||
       levels.fresher+levels.early_career+levels.unspecified_or_other!==data.jobs.length)
      throw Error("Fresher and early-career evidence counts are inconsistent with live job feed");
    console.log("Fresher opportunities:",levels.fresher,"early-career:",levels.early_career);
    console.log("India-only postings:",data.jobs.length,"employer boards:",data.scan?.scanned,"categories:",JSON.stringify(data.category_counts),"scan:",data.scan?.status);
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
