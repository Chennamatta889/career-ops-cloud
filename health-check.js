/* Phase 4.5 Career-Ops diagnostics.
 * READ-ONLY: never uploads resumes, reserves AI quota, calls Gemini,
 * sends authentication mail, or submits applications.
 */
(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const cfg=window.CAREEROPS_PRIVATE_CONFIG||{};
  const base=String(cfg.supabaseUrl||"").replace(/\/$/,"");
  const key=String(cfg.publishableKey||"");
  const status=(name,detail,kind)=>({name,detail,kind});
  async function fetchChecked(url,options={}){
    const response=await fetch(url,{
      method:options.method||"GET",
      headers:options.headers||{},
      cache:"no-store",
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw Error("HTTP "+response.status);
    if(options.method==="HEAD")return true;
    return response.json();
  }
  function render(items){
    const host=$("healthResults");
    host.replaceChildren();
    for(const item of items){
      const line=document.createElement("div");
      line.className="health-line";
      line.dataset.state=item.kind;
      const symbol=document.createElement("span");
      symbol.textContent=item.kind==="pass"?"✓":item.kind==="skip"?"–":item.kind==="warn"?"!":"×";
      symbol.className="health-symbol";
      const copy=document.createElement("div");
      const label=document.createElement("strong");
      label.textContent=item.name;
      const detail=document.createElement("p");
      detail.textContent=item.detail;
      copy.append(label,detail);
      line.append(symbol,copy);
      host.append(line);
    }
    const passes=items.filter(x=>x.kind==="pass").length;
    const failures=items.filter(x=>x.kind==="fail").length;
    const warnings=items.filter(x=>x.kind==="warn").length;
    $("healthSummary").textContent=
      passes+" checks passed · "+failures+" failed · "+warnings+" warnings · "+new Date().toLocaleString()+
      ". These are connectivity/configuration checks, not proof that Gemini generation or every resume file works.";
  }
  async function performChecks(){
    const button=$("runHealthChecks");
    if(button.disabled)return;
    button.disabled=true;
    $("healthSummary").textContent="Checking public site, sign-in and private services. No paid AI calls will be made…";
    $("healthResults").replaceChildren();
    try{
      const results=[];
      async function check(name,fn){
        try{return await fn();}
        catch(e){return status(name,"Check failed: "+String(e?.message||e).slice(0,160),"fail");}
      }
      const publicChecks=[
        check("Published job feed",async()=>{
          const feed=await fetchChecked("./data/jobs.json?v="+Date.now());
          if(feed?.schema!=="careerops.public-jobs.v1" || !Array.isArray(feed.jobs))
            throw Error("Published jobs file has an unexpected format.");
          if(feed.scan?.status==="failed")return status("Published job feed","Last scan failed; inspect the GitHub Actions scanner run.","warn");
          const count=feed.jobs.length;
          return status("Published job feed",count+" job records loaded from the public scanner. Not a live hiring guarantee.","pass");
        }),
        check("Browser resume extraction",async()=>{
          if(typeof window.CareerOpsResumeParser?.parseFile!=="function")
            throw Error("Local parser entrypoint is missing.");
          const files=["pdf.min.mjs","pdf.worker.min.mjs","mammoth.browser.min.js"];
          const checks=await Promise.all(files.map(name=>
            fetchChecked("./vendor/"+name,{method:"HEAD"}).then(()=>true).catch(()=>false)));
          if(checks.some(x=>!x))throw Error("One or more PDF/DOCX library assets did not load.");
          return status("Browser resume extraction","PDF and DOCX parser assets are available. This does not test a particular resume.","pass");
        }),
        check("Google OAuth provider",async()=>{
          if(!base.startsWith("https://") || !key.startsWith("sb_publishable_"))
            throw Error("Supabase public configuration is incomplete.");
          const auth=await fetchChecked(base+"/auth/v1/settings",{headers:{apikey:key}});
          if(auth?.external?.google===false)
            return status("Google OAuth provider","Disabled in Career-Ops Supabase Authentication → Providers.","warn");
          if(auth?.external?.google!==true)
            return status("Google OAuth provider","Provider status could not be confirmed.","warn");
          return status("Google OAuth provider","Google provider is enabled; an actual sign-in is still a separate test.","pass");
        })
      ];
      results.push(...await Promise.all(publicChecks));

      const token=await window.CareerOpsAuth?.getAccessToken?.().catch(()=>null);
      if(!token){
        results.push(status("Signed-in session","Sign in with Google from AI Studio to run private checks.","skip"));
        results.push(status("Private resume vault","Not checked without a signed-in account.","skip"));
        results.push(status("Private job tracker","Not checked without a signed-in account.","skip"));
        results.push(status("AI review configuration","Not checked without a signed-in account.","skip"));
      }else {
        const headers={apikey:key,Authorization:"Bearer "+token,Accept:"application/json"};
        const privateChecks=[
          check("Signed-in session",async()=>{
            const auth=await fetchChecked(base+"/auth/v1/user",{headers});
            if(!auth || typeof auth.id!=="string")throw Error("Supabase did not validate your session.");
            return status("Signed-in session","Authenticated account validated by Supabase.","pass");
          }),
          check("Private resume vault",async()=>{
            await fetchChecked(base+"/rest/v1/careerops_resume_vault?select=user_id&limit=1",{headers});
            return status("Private resume vault","Owner-scoped metadata query succeeded. No resume text was downloaded.","pass");
          }),
          check("Private job tracker",async()=>{
            await fetchChecked(base+"/rest/v1/careerops_job_tracking?select=user_id&limit=1",{headers});
            return status("Private job tracker","Owner-scoped metadata query succeeded. No job descriptions were downloaded.","pass");
          }),
          check("AI review configuration",async()=>{
            const response=await fetch(base+"/functions/v1/careerops-ai-review",{
              method:"POST",
              headers:{...headers,"Content-Type":"application/json"},
              body:JSON.stringify({action:"status"}),
              cache:"no-store",
              signal:AbortSignal.timeout(10000)
            });
            if(!response.ok)throw Error("AI status endpoint returned HTTP "+response.status);
            const result=await response.json();
            if(result?.ready!==true)return status("AI review configuration",
              "AI service is not ready. Check private function settings and quotas.","warn");
            return status("AI review configuration",
              "Server settings are ready; Gemini generation was NOT requested, so model output is unverified.","pass");
          })
        ];
        results.push(...await Promise.all(privateChecks));
      }
      render(results);
    }catch(e){
      $("healthSummary").textContent="Diagnostics could not complete: "+String(e?.message||e).slice(0,200);
    }finally{button.disabled=false;}
  }
  $("runHealthChecks").addEventListener("click",performChecks);
})();
