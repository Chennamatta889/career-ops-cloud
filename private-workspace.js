/* Career-Ops Phase 4: secure PostgREST resume text vault and tracking sync.
 * Only the user's OAuth access token accesses the owner-scoped RLS tables.
 * No service role keys, passwords, PDF bytes, provider credentials or Gemini calls.
 */
(function(){
  "use strict";
  const config=window.CAREEROPS_PRIVATE_CONFIG||{};
  const base=String(config.supabaseUrl||"").replace(/\/$/,"");
  const apiKey=String(config.publishableKey||"");
  const $=id=>document.getElementById(id);
  const MAX_RESUME=16000;
  const STAGES=["Saved","Review","Applied","Interview","Offer","Rejected"];
  let currentUser=null;
  let syncing=false;
  let vaultBusy=false;
  let accountVersion=0; // invalidates requests returning after Google account changes
  const changedAccount=()=>new Error("Your signed-in account changed during this request. Please retry.");
  let hasSavedResume=null;
  const safe=(x,max=200)=>typeof x==="string"?x.trim().slice(0,max):"";
  const status=(elementId,message,state)=>{
    const el=$(elementId);
    if(!el)return;
    el.textContent=message;
    el.dataset.state=state||"idle";
  };
  function requireSignedIn(){
    if(!currentUser || !/^[0-9a-fA-F-]{36}$/.test(currentUser.id))
      throw Error("Sign in with Google in AI Studio first.");
    if(!base.startsWith("https://") || !apiKey.startsWith("sb_publishable_"))
      throw Error("Private Supabase project is not configured.");
    if(!window.CareerOpsAuth?.getAccessToken)
      throw Error("Login session is unavailable. Reload AI Studio.");
    return currentUser;
  }
  async function request(path,method="GET",body,extra={}){
    const account=requireSignedIn();
    const version=accountVersion;
    const jwt=await window.CareerOpsAuth.getAccessToken();
    if(accountVersion!==version || currentUser?.id!==account.id)throw changedAccount();
    if(!jwt)throw Error("Google session expired. Sign in again.");
    const headers={
      apikey:apiKey,
      Authorization:"Bearer "+jwt,
      "Content-Type":"application/json",
      Accept:"application/json",
      ...extra
    };
    let response;
    try{
      response=await fetch(base+"/rest/v1/"+path,{
        method,headers,body:body===undefined?undefined:JSON.stringify(body),
        cache:"no-store",signal:AbortSignal.timeout(18000)
      });
    }catch(_){throw Error("Private storage service is unreachable. Check your connection and retry.");}
    if(accountVersion!==version || currentUser?.id!==account.id)throw changedAccount();
    if(!response.ok){
      let parsed={};try{parsed=await response.json();}catch(_){}
      const message=safe(parsed.message||parsed.details||"",150);
      if(response.status===401 || response.status===403)throw Error("Private storage authorization failed. Sign in and retry.");
      if(response.status===404)throw Error("Private tables are not available in this Supabase project.");
      throw Error("Private storage error (HTTP "+response.status+")"+(message?": "+message:""));
    }
    if(response.status===204 || method==="DELETE" || extra.Prefer?.includes("return=minimal"))return null;
    try{return await response.json();}catch(_){return null;}
  }
  const qs=v=>encodeURIComponent(String(v));
  async function checkVault(){
    if(!currentUser)return;
    try{
      const rows=await request("careerops_resume_vault?select=label,source_filename,updated_at&user_id=eq."+qs(currentUser.id)+"&limit=1");
      if(Array.isArray(rows)&&rows.length){
        hasSavedResume=true;
        const d=rows[0];
        status("vaultStatus","Saved resume: "+safe(d.label,100)+" · "+new Date(d.updated_at).toLocaleDateString()+". Tap Load saved resume to reuse the private text.","success");
      }else {hasSavedResume=false;status("vaultStatus","No private resume saved yet. Upload a PDF/DOCX/TXT (or paste text), verify it and tap Save resume privately.","idle");}
    }catch(e){status("vaultStatus","Private vault unavailable: "+safe(e.message,200),"error");}
  }
  async function saveVault(){
    if(vaultBusy)return;
    const me=requireSignedIn();
    const text=$("aiResume").value.trim();
    if(text.length<250 || text.length>MAX_RESUME){
      status("vaultStatus","Paste or extract 250–16,000 characters of accurate resume text before saving.","error");return;
    }
    vaultBusy=true;$("vaultSave").disabled=true;
    status("vaultStatus","Saving extracted resume text to your private Supabase vault…","loading");
    try {
      const filename=($("aiResumeParseStatus").dataset.filename||"").slice(0,160);
      await request("careerops_resume_vault?on_conflict=user_id","POST",{
        user_id:me.id,label:"Primary resume",resume_text:text,
        source_filename:filename,updated_at:new Date().toISOString()
      },{"Prefer":"resolution=merge-duplicates,return=minimal"});
      hasSavedResume=true;
      status("vaultStatus","Resume text saved privately. You can load it after signing in on another device. No AI call was made.","success");
    } catch(e){status("vaultStatus","Could not save resume: "+safe(e.message,190),"error");}
    finally{$("vaultSave").disabled=false;vaultBusy=false;}
  }
  async function loadVault(onlyIfEmpty=false){
    if(vaultBusy)return;
    const me=requireSignedIn();
    if(!onlyIfEmpty && $("aiResume").value.trim() &&
      !window.confirm("Replace the resume text currently in the editor with your saved private resume?"))return;
    vaultBusy=true;$("vaultLoad").disabled=true;
    status("vaultStatus","Loading your private resume text…","loading");
    try{
      const rows=await request("careerops_resume_vault?select=resume_text,source_filename,updated_at&user_id=eq."+qs(me.id)+"&limit=1");
      if(!Array.isArray(rows)||!rows.length){
        status("vaultStatus","No saved resume found. Upload and save one first.","idle");return;
      }
      const raw=safe(rows[0].resume_text,MAX_RESUME);
      if(raw.length<250)throw Error("Saved resume text is incomplete.");
      if(onlyIfEmpty && $("aiResume").value.trim()) {
        status("vaultStatus","Resume editor already has text. Existing text was preserved.","idle");
        return;
      }
      // Never write resume text into localStorage or any public job feed.
      $("aiResume").value=raw;
      $("aiResume").dispatchEvent(new Event("input",{bubbles:true}));
      status("vaultStatus","Private resume loaded into Step 01 ("+raw.length+" characters). Verify the content before AI Review.","success");
    }catch(e){status("vaultStatus","Could not load resume: "+safe(e.message,190),"error");}
    finally{$("vaultLoad").disabled=false;vaultBusy=false;}
  }
  async function deleteVault(){
    if(vaultBusy)return;
    const me=requireSignedIn();
    if(!window.confirm("Delete your saved resume text permanently from your private Career-Ops vault? This does not delete files on your device."))return;
    vaultBusy=true;$("vaultDelete").disabled=true;
    try{
      await request("careerops_resume_vault?user_id=eq."+qs(me.id),"DELETE",undefined,{"Prefer":"return=minimal"});
      hasSavedResume=false;
      status("vaultStatus","Saved resume deleted from the private vault. Text currently open in the editor remains until you clear it.","success");
    }catch(e){status("vaultStatus","Could not delete resume: "+safe(e.message,190),"error");}
    finally{$("vaultDelete").disabled=false;vaultBusy=false;}
  }
  function validTracked(job){
    if(!job || !STAGES.includes(job.stage) || !safe(job.title,160) || !safe(job.company,130))return null;
    const key=safe(job.job_key,1500);
    if(key.length<6)return null;
    const url=safe(job.job_url,1500);
    let safeURL="";
    try{const u=new URL(url);if(["http:","https:"].includes(u.protocol))safeURL=u.href.slice(0,1500);}catch(_){}
    return {
      user_id:currentUser.id,job_key:key,title:safe(job.title,160),
      company:safe(job.company,130),location:safe(job.location,160),
      job_url:safeURL,stage:job.stage,updated_at:new Date().toISOString()
    };
  }
  function trackedPayload(job){
    const raw={
      // Preserve the dashboard's stable key exactly. Manual jobs use '/'
      // separators so cloud imports match the same local record on reload.
      job_key:safe(job.job_key,1500) || safe(job.url,1500) ||
        ("manual:"+[job.company,job.title,job.location].map(x=>safe(x,140).toLowerCase()).join("/")),
      title:job.title,company:job.company,location:job.location,
      job_url:job.url,stage:job.stage
    };
    return validTracked(raw);
  }
  async function syncRemote(){
    if(!currentUser || syncing)return;
    syncing=true;$("cloudRefreshTracking").disabled=true;
    status("cloudTrackingStatus","Loading your private tracked-job records…","loading");
    try {
      const rows=await request("careerops_job_tracking?select=job_key,title,company,location,job_url,stage,updated_at&order=updated_at.desc&limit=300");
      const list=Array.isArray(rows)?rows:[];
      const merged=window.CareerOpsDashboard?.mergeRemoteTracking(list)||0;
      status("cloudTrackingStatus","Cloud tracking connected · "+list.length+" saved records · "+merged+" matched or restored on this device. New changes sync when signed in.","success");
    }catch(e){status("cloudTrackingStatus","Cloud tracking unavailable: "+safe(e.message,190),"error");}
    finally{syncing=false;$("cloudRefreshTracking").disabled=false;}
  }
  async function sendTrackingChange(event){
    if(!currentUser)return;
    const raw=event.detail?.job;
    if(!raw || !safe(raw.title,160) || !safe(raw.company,130))return;
    // Use a validated key even when the user un-saves a job (stage="").
    // The unsave operation must DELETE its cloud record, not silently return.
    const payload=trackedPayload({...raw,stage:raw.stage || "Saved"});
    if(!payload)return;
    status("cloudTrackingStatus","Syncing "+safe(raw.title,65)+"…","loading");
    try {
      if(!raw.stage){
        await request("careerops_job_tracking?user_id=eq."+qs(currentUser.id)+"&job_key=eq."+qs(payload.job_key),"DELETE",undefined,{"Prefer":"return=minimal"});
      } else {
        await request("careerops_job_tracking?on_conflict=user_id,job_key","POST",payload,{"Prefer":"resolution=merge-duplicates,return=minimal"});
      }
      status("cloudTrackingStatus","Saved job status synced privately to Supabase.","success");
    }catch(e){status("cloudTrackingStatus","Job saved locally, but cloud sync failed: "+safe(e.message,160)+". Use Sync tracked jobs after fixing the connection.","error");}
  }
  async function importLocal(){
    if(!currentUser)return;
    const me=requireSignedIn();
    const dashboard=window.CareerOpsDashboard;
    // Legacy browser-wide records are NEVER displayed automatically for a
    // different signed-in account. They can only be migrated on explicit
    // confirmation, with an additional warning on shared devices.
    const previous=dashboard?.getLegacyTrackedJobs?.()||[];
    const current=dashboard?.getTrackedJobs?.()||[];
    const byKey=new Map();
    for(const item of previous.concat(current)){
      const safeJob=validTracked({...item,user_id:me.id});
      if(safeJob)byKey.set(safeJob.job_key,safeJob);
    }
    const values=[...byKey.values()].slice(0,300);
    if(!values.length){status("cloudTrackingStatus","There are no real tracked jobs on this device to import.","idle");return;}
    if(!window.confirm("Upload "+values.length+" job statuses to your current private account?"+
      (previous.length?" This device also contains "+previous.length+" older, unassigned saved jobs. Only continue if these belong to you; data from another account may be present.":"")))return;
    $("cloudImportTracking").disabled=true;
    status("cloudTrackingStatus","Uploading this device's tracked jobs privately…","loading");
    try{
      // Small batches avoid overlarge requests and excessive provider usage.
      for(let i=0;i<values.length;i+=50){
        await request("careerops_job_tracking?on_conflict=user_id,job_key","POST",values.slice(i,i+50),
          {"Prefer":"resolution=merge-duplicates,return=minimal"});
      }
      dashboard?.mergeRemoteTracking(values);
      // Remove unassigned browser-wide records after the user explicitly
      // confirms migration and every upload batch completes successfully.
      if(previous.length)dashboard?.clearLegacyTrackedJobs?.();
      status("cloudTrackingStatus",values.length+" tracked jobs imported privately. Their future status changes will sync automatically.","success");
    }catch(e){status("cloudTrackingStatus","Could not import local tracking: "+safe(e.message,160),"error");}
    finally{$("cloudImportTracking").disabled=false;}
  }

  const perform=(fn,where)=>async()=>{
    try{await fn();}catch(e){status(where,safe(e.message,220),"error");}
  };
  $("vaultSave").addEventListener("click",perform(saveVault,"vaultStatus"));
  $("vaultLoad").addEventListener("click",perform(loadVault,"vaultStatus"));
  $("vaultDelete").addEventListener("click",perform(deleteVault,"vaultStatus"));
  $("cloudRefreshTracking").addEventListener("click",perform(syncRemote,"cloudTrackingStatus"));
  $("cloudImportTracking").addEventListener("click",perform(importLocal,"cloudTrackingStatus"));
  window.addEventListener("careerops:tracking-changed",event=>{sendTrackingChange(event);});
  window.addEventListener("careerops:authenticated",event=>{
    const info=event.detail||{};
    if(!/^[0-9a-fA-F-]{36}$/.test(String(info.id||"")))return;
    if(currentUser?.id===info.id)return;
    accountVersion++;
    hasSavedResume=null;
    syncing=false;
    vaultBusy=false;
    currentUser={id:info.id};
    status("cloudTrackingStatus","Signed in. Connecting to private job tracking…","loading");
    checkVault();
    syncRemote();
  });
  window.addEventListener("careerops:signed-out",()=>{
    accountVersion++;
    syncing=false;
    vaultBusy=false;
    currentUser=null;
    hasSavedResume=null;
    status("vaultStatus","Sign in with Google to access your private resume text.","idle");
    status("cloudTrackingStatus","Signed out. Browser-local job statuses remain on this device; cloud sync is paused.","idle");
  });
  // Job card → AI Studio: reuse a previously saved private resume without
  // repeating file uploads. Only authenticated sessions can retrieve it.
  // This never invokes Gemini; AI processing still needs consent and a click.
  window.addEventListener("careerops:job-selected",()=>{
    if(currentUser && hasSavedResume!==false && !$("aiResume").value.trim() && !vaultBusy){
      loadVault(true).catch(e=>status("vaultStatus",safe(e.message,160),"error"));
    }
  });
  window.addEventListener("careerops:resume-parse-result",event=>{
    if(event.detail?.success){
      const el=$("aiResumeParseStatus");
      el.dataset.filename=safe(event.detail.filename,160);
      status("vaultStatus","Resume extracted locally. Review the text and tap Save resume privately to store it across devices.","idle");
    }
  });
})();
