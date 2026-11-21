/**
 * Read-only public Google Auth provider verification.
 * This does NOT request login, send email, submit credentials or show keys.
 * A nonzero status means provider settings couldn't be verified.
 */
import fs from "node:fs";
import vm from "node:vm";

const ctx={window:{}};
vm.runInNewContext(fs.readFileSync("careerops-config.js","utf8"),ctx,{filename:"careerops-config.js"});
const cfg=ctx.window.CAREEROPS_PRIVATE_CONFIG;
const url=String(cfg?.supabaseUrl||"");
const key=String(cfg?.publishableKey||"");
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key.startsWith("sb_publishable_")){
  throw Error("Public Career-Ops Supabase configuration is incomplete.");
}
try{
  const response=await fetch(url+"/auth/v1/settings",{
    headers:{"apikey":key,"Accept":"application/json"},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error("Auth settings endpoint returned HTTP "+response.status);
  const settings=await response.json();
  const value=settings?.external?.google;
  let report;
  if(value===true) {
    report="Google provider: ENABLED in Career-Ops Supabase Auth settings.";
    console.log(report);
    console.log("This checks provider activation, not an individual user's end-to-end login.");
  } else if(value===false) {
    report="Google provider: DISABLED in Career-Ops Supabase Auth settings. Open Authentication → Sign In / Providers → Google and enable it in project nnhzihcugvifhegsfmua.";
    console.error(report);
    console.log("::warning title=Google OAuth disabled::"+report);
    process.exitCode=1;
  } else {
    report="Google provider: UNVERIFIED (Supabase Auth settings response did not include external.google).";
    console.error(report);
    console.log("::warning title=Google OAuth status unknown::"+report);
    process.exitCode=1;
  }
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,"### Career-Ops Google OAuth check\n\n"+report+"\n\n");
}catch(e){
  console.error("Google provider verification failed:",String(e?.message||e).slice(0,200));
  process.exitCode=1;
}
