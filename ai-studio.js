/* Career-Ops AI Lab. Resume and drafts stay in this tab, never localStorage or GitHub.
 * Requests are sent only after explicit consent to a separate private AI endpoint.
 */
(function(){
  "use strict";
  const byId = id => document.getElementById(id);
  const cfg = window.CAREEROPS_PRIVATE_CONFIG || {};
  const base = String(cfg.supabaseUrl || "").replace(/\/$/,"");
  const key = String(cfg.publishableKey || "");
  const ready = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base) && key.length > 20;
  const tokenKey = "careerops-v3-tab-session";
  let session = null;
  let activeResult = null;
  let reviewReady = false;
  let authCallbackError = "";
  let googleProviderEnabled = null; // true/false/null: verified/disabled/unknown
  let googleRedirectStarted = false;
  const siteRedirect = "https://chennamatta889.github.io/career-ops-cloud/";
  const siteOrigin = new URL(siteRedirect).origin;
  const text = (v,n=10000) => typeof v==="string" ? v.trim().slice(0,n) : "";
  const set = (id,message) => { byId(id).textContent = message; };
  const status = message => set("aiStatus",message);

  // A timestamp-only local flag prevents accidental repeated emails across
  // tabs. No credentials, email address, or resume are stored in localStorage.
  const emailCooldownStorageKey="careerops-auth-email-next-request-v1";
  const normalEmailCooldownMs=90*1000;
  const exhaustedEmailCooldownMs=60*60*1000;
  let emailCooldownUntil=0;
  let emailRequestInFlight=false;
  let emailTimer=null;
  let emailNotice="Request one sign-in email and use its link. Repeated taps consume the project's limited email quota.";
  function readEmailCooldown(){
    try{
      const val=Number(localStorage.getItem(emailCooldownStorageKey)||0);
      if(Number.isFinite(val)&&val>Date.now()&&val<Date.now()+25*60*60*1000)emailCooldownUntil=val;
    }catch(_){}
  }
  function setEmailCooldown(ms){
    emailCooldownUntil=Date.now()+ms;
    try{localStorage.setItem(emailCooldownStorageKey,String(emailCooldownUntil));}catch(_){}
    updateEmailButton();
  }
  function remainingEmailTime(){
    const seconds=Math.ceil(Math.max(0,emailCooldownUntil-Date.now())/1000);
    const minutes=Math.floor(seconds/60);
    return minutes?minutes+"m "+String(seconds%60).padStart(2,"0")+"s":seconds+"s";
  }
  function updateEmailButton(){
    const button=byId("aiSendLink");
    if(!button)return;
    if(emailTimer){clearTimeout(emailTimer);emailTimer=null;}
    const locked=Date.now()<emailCooldownUntil;
    button.disabled=emailRequestInFlight||locked;
    button.textContent=emailRequestInFlight?"Requesting secure link…":
      locked?"Try again in "+remainingEmailTime():"Email sign-in link";
    const detail=byId("aiEmailCooldown");
    if(detail) {
      detail.textContent=locked ?
        emailNotice+" No new email requests for approximately "+remainingEmailTime()+". If you have a recent unused sign-in link, you may use it instead.":
        emailNotice;
    }
    if(locked)emailTimer=setTimeout(updateEmailButton,Math.min(15000,Math.max(1000,emailCooldownUntil-Date.now())));
  }
  readEmailCooldown();

  function prerequisites() {
    const resume = byId("aiResume").value.trim();
    const jd = byId("aiJd").value.trim();
    const role = byId("aiRole").value.trim();
    const missing = [];
    if (resume.length < 250) missing.push("resume (" + resume.length + "/250 characters)");
    if (jd.length < 200) missing.push("full job description (" + jd.length + "/200 characters)");
    if (!role) missing.push("job title");
    if (!byId("aiConsent").checked) missing.push("AI processing consent");
    set("aiResumeCount",resume.length + " characters · " + (resume.length>=250?"Ready":"Minimum 250"));
    set("aiJdCount",jd.length + " characters · " + (jd.length>=200?"Ready":"Minimum 200 · paste the full employer job description"));
    set("aiChecklist",missing.length ? "Before reviewing, add: " + missing.join("; ") + "." : "Inputs complete. Check the AI connection, then review.");
    return missing;
  }
  async function checkReviewConnection(accessToken) {
    reviewReady = false;
    const token = accessToken || await getAccessToken();
    if (!token) {status("Sign in to check the AI Review connection.");return false;}
    status("Checking private AI Review configuration...");
    try {
      const result = await api("/functions/v1/careerops-ai-review",{
        method:"POST",headers:headers(token),body:JSON.stringify({action:"status"})
      });
      reviewReady = result.ok===true && result.ready===true;
      const missing = Array.isArray(result.missing) ? result.missing.join(", ") : "";
      const modelName=text(result.model,75);
      status(reviewReady ? "AI endpoint ready" + (modelName ? " · model: "+modelName : "") + ". Complete your resume and job description to generate drafts."
        : "AI backend is connected but not enabled. Missing private settings: " + (missing || "unknown") +
          ". Configure these in Career-Ops Supabase → Edge Functions → Secrets.");
      return reviewReady;
    } catch (error) {
      const msg = text(error?.message || error,200);
      status("AI connection check failed: " + (msg==="Failed to fetch" ? "Browser could not reach the function (check deployment and CORS settings)." : msg));
      return false;
    }
  }
  function saveSession(s) {
    session=s;
    if (s) sessionStorage.setItem(tokenKey,JSON.stringify(s));
    else sessionStorage.removeItem(tokenKey);
  }
  function headers(jwt) {
    const out={"apikey":key,"Content-Type":"application/json"};
    if(jwt) out.Authorization="Bearer "+jwt;
    return out;
  }
  async function readResponse(r) {
    let x={};try{x=await r.json();}catch(_){}
    if (!r.ok || x.error) throw new Error(text(x.error_description || x.msg || x.error || x.message,220) || ("HTTP "+r.status));
    return x;
  }
  async function api(path,options={}) {
    if(!ready)throw Error("Configure a dedicated Career-Ops Supabase project first.");
    return readResponse(await fetch(base+path,options));
  }
  function googleOAuthUrl() {
    if (!ready) throw Error("Career-Ops private authentication is not configured.");
    if (location.origin !== siteOrigin || location.pathname !== new URL(siteRedirect).pathname) {
      throw Error("Google Sign-In is available only on the official Career-Ops website.");
    }
    // Supabase's hosted OAuth endpoint handles Google Client ID and Secret.
    // No Google OAuth secrets belong in the browser or public GitHub repository.
    const url = new URL(base + "/auth/v1/authorize");
    url.searchParams.set("provider","google");
    url.searchParams.set("redirect_to",siteRedirect);
    return url.toString();
  }
  async function checkGoogleProvider() {
    if(!ready) return;
    const button=byId("aiGoogleSignIn");
    const help=byId("aiGoogleHelp");
    help.textContent="Checking whether Google is enabled in Career-Ops Supabase Auth…";
    button.disabled=true;
    try{
      const settings=await api("/auth/v1/settings",{headers:headers()});
      const enabled=settings?.external?.google;
      if(enabled===true) {
        googleProviderEnabled=true;
        help.textContent="Google Sign-In enabled. Choose the same Gmail account approved for Career-Ops AI Review.";
      } else if(enabled===false) {
        googleProviderEnabled=false;
        help.textContent="Google Sign-In is disabled in the Career-Ops Supabase project. Enable and save Authentication → Sign In / Providers → Google, then reload this page.";
      } else {
        googleProviderEnabled=null;
        help.textContent="Could not verify Google's provider setting. Confirm Google is enabled in Career-Ops Supabase before signing in.";
      }
    } catch(_error) {
      googleProviderEnabled=null;
      help.textContent="Couldn't check Google provider settings. Google sign-in may still work; verify Supabase Auth settings if it fails.";
    } finally {
      button.disabled=googleRedirectStarted || googleProviderEnabled===false;
    }
  }
  function readUrlSession() {
    const hash=location.hash.startsWith("#") ? new URLSearchParams(location.hash.slice(1)) : null;
    const query=new URLSearchParams(location.search || "");
    const authError=hash?.get("error") || hash?.get("error_code") || query.get("error") || query.get("error_code");
    if (authError) {
      const detail=hash?.get("error_description") || query.get("error_description") || authError;
      authCallbackError="Google sign-in did not complete: "+text(detail,190)+". Check that Google is enabled in Career-Ops Supabase and your Gmail account is authorized.";
      history.replaceState(null,"",location.pathname+"#ai"); // remove error parameters
      document.querySelector('[data-nav="ai"]')?.click();
      return;
    }
    if(!hash || !hash.get("access_token"))return;
    const expiresAt=Number(hash.get("expires_at"));
    const expiresIn=Number(hash.get("expires_in"));
    const expiry=Number.isFinite(expiresAt)&&expiresAt>0?expiresAt:
      Math.floor(Date.now()/1000)+(Number.isFinite(expiresIn)&&expiresIn>0?expiresIn:3600);
    saveSession({
      access_token:hash.get("access_token"),
      refresh_token:hash.get("refresh_token") || "",
      expires_at:expiry
    });
    // Remove credential-bearing fragment before showing the signed-in page.
    history.replaceState(null,"",location.pathname+location.search+"#ai");
    document.querySelector('[data-nav="ai"]')?.click();
  }
  async function getAccessToken() {
    if(!session) return null;
    if(session.expires_at*1000>Date.now()+60000)return session.access_token;
    if(!session.refresh_token){saveSession(null);return null;}
    try{
      const x=await api("/auth/v1/token?grant_type=refresh_token",{
        method:"POST",headers:headers(),body:JSON.stringify({refresh_token:session.refresh_token})
      });
      saveSession({access_token:x.access_token,refresh_token:x.refresh_token,expires_at:Math.floor(Date.now()/1000)+(Number(x.expires_in)||3600)});
      return session.access_token;
    }catch(_){saveSession(null);return null;}
  }
  async function refreshAuth() {
    if(!ready){byId("aiLogin").hidden=true;byId("aiWorkspace").hidden=true;status("Backend not connected. A dedicated Supabase project and server-side Gemini key are required.");return;}
    byId("aiLogin").hidden=false;
    const token=await getAccessToken();
    if(!token){byId("aiWorkspace").hidden=true;byId("aiSignOut").hidden=true;status(authCallbackError || "Private backend connected. Continue with Google to sign in without an email link.");return;}
    try{
      const user=await api("/auth/v1/user",{headers:headers(token)});
      set("aiSignedUser",user.email || "Signed in");
      if (typeof user.id === "string") window.dispatchEvent(new CustomEvent("careerops:authenticated",{detail:{id:user.id,email:user.email||""}}));
      byId("aiWorkspace").hidden=false;
      byId("aiSignOut").hidden=false;
      byId("aiLogin").hidden=true;
      status("Signed in. Checking whether AI Review is enabled...");
      await checkReviewConnection(token);
    }catch(_){
      saveSession(null);byId("aiWorkspace").hidden=true;byId("aiLogin").hidden=false;byId("aiSignOut").hidden=true;
      status("Session expired. Please sign in again.");
    }
  }
  function arraySection(title,items) {
    const section=document.createElement("section");section.className="ai-answer-section";
    const h=document.createElement("h3");h.textContent=title;section.append(h);
    const list=document.createElement("ul");
    for(const s of Array.isArray(items)?items:[]){
      const li=document.createElement("li");li.textContent=text(s,500);list.append(li);
    }
    if(!list.children.length){const p=document.createElement("p");p.textContent="No verified details returned.";section.append(p);}
    else section.append(list);
    return section;
  }
  function paragraphSection(title,content) {
    const section=document.createElement("section");section.className="ai-answer-section";
    const h=document.createElement("h3");h.textContent=title;section.append(h);
    const p=document.createElement("pre");p.className="ai-draft-text";p.textContent=text(content,5000) || "Not provided.";
    section.append(p);return section;
  }
  function renderResult(result){
    activeResult=result;
    const host=byId("aiResult");host.replaceChildren();
    const header=document.createElement("div");header.className="ai-result-heading";
    const h=document.createElement("h2");h.textContent=(typeof result.matchScore==="number" ? result.matchScore+"/100" : "Unscored")+" · AI job assessment";
    const p=document.createElement("p");p.textContent=text(result.fitVerdict,180);
    header.append(h,p);host.append(header);
    host.append(arraySection("Evidence-based strengths",result.strengths));
    host.append(arraySection("Missing or unverified requirements",result.gaps));
    host.append(arraySection("Cautions — verify before applying",result.cautions));
    host.append(paragraphSection("Tailored resume summary (draft)",result.tailoredSummary));
    host.append(arraySection("Tailored resume bullets (verify facts)",result.tailoredBullets));
    host.append(paragraphSection("Cover letter (draft)",result.coverLetter));
    host.append(paragraphSection("Recruiter email subject",result.recruiterEmailSubject));
    host.append(paragraphSection("Recruiter outreach email (draft)",result.recruiterEmailBody));
    host.append(arraySection("Suggested screening answers",result.screeningAnswers));
    const small=document.createElement("p");small.className="ai-disclaimer";small.textContent=result.disclaimer || "AI drafts require human verification. No application was submitted.";
    host.append(small);
    host.hidden=false;byId("aiDownload").hidden=false;
  }
  function exportDraft() {
    if(!activeResult)return;
    const d=activeResult;
    const lines=[
      "Career-Ops AI Job Review — draft, not verified",
      "Job: "+byId("aiRole").value.trim()+" at "+byId("aiCompany").value.trim(),
      "Match score: "+(d.matchScore??"unknown"),
      "Fit: "+d.fitVerdict,"",
      "Strengths:\n"+(d.strengths||[]).map(x=>"- "+x).join("\n"),"",
      "Gaps:\n"+(d.gaps||[]).map(x=>"- "+x).join("\n"),"",
      "Cautions:\n"+(d.cautions||[]).map(x=>"- "+x).join("\n"),"",
      "Tailored summary:\n"+d.tailoredSummary,"",
      "Tailored bullets:\n"+(d.tailoredBullets||[]).map(x=>"- "+x).join("\n"),"",
      "Cover letter:\n"+d.coverLetter,"",
      "Recruiter email subject:\n"+d.recruiterEmailSubject,"",
      "Recruiter email:\n"+d.recruiterEmailBody,"",
      "Screening ideas:\n"+(d.screeningAnswers||[]).join("\n"),"",
      "IMPORTANT: Review each claim. No resume has been changed or submitted."
    ];
    const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"});
    const u=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=u;a.download="career-ops-ai-review.txt";
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
  }
  byId("aiGoogleSignIn").addEventListener("click",function(){
    if (this.disabled) return;
    try {
      const url=googleOAuthUrl();
      googleRedirectStarted=true;
      this.disabled=true;
      byId("aiGoogleHelp").textContent="Opening Google account selection. Return to Career-Ops after authorizing.";
      status("Redirecting to Google sign-in…");
      location.assign(url);
    } catch(error) {
      googleRedirectStarted=false;
      this.disabled=googleProviderEnabled===false;
      const message=text(error?.message||error,220);
      byId("aiGoogleHelp").textContent=message;
      status("Unable to start Google Sign-In: "+message);
    }
  });
  window.addEventListener("pageshow",()=>{
    const button=byId("aiGoogleSignIn");
    googleRedirectStarted=false;
    if(button)button.disabled=googleProviderEnabled===false;
  });
  byId("aiSendLink").addEventListener("click",async function(){
    if(emailRequestInFlight)return;
    if(Date.now()<emailCooldownUntil){
      updateEmailButton();
      status("Email sign-in is on cooldown. Please use a valid link already in your inbox or wait before requesting another.");
      return;
    }
    const email=byId("aiEmail").value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status("Enter a valid email address.");return;}
    emailRequestInFlight=true;
    updateEmailButton();
    try{
      await api("/auth/v1/otp?redirect_to="+encodeURIComponent(location.origin+location.pathname),{
        method:"POST",headers:headers(),body:JSON.stringify({email,create_user:true})
      });
      emailNotice="Sign-in link requested successfully. Check your inbox and spam folder. Avoid requesting another link unless it is necessary.";
      setEmailCooldown(normalEmailCooldownMs);
      status("Sign-in email requested. Open the link you received rather than tapping the send button again.");
    }catch(e){
      const msg=text(e?.message||e,250);
      if(/email rate limit exceeded|over_email_send_rate_limit/i.test(msg)){
        emailNotice="Supabase has reached its authentication-email quota (the built-in provider allows only two emails per hour across this project).";
        setEmailCooldown(exhaustedEmailCooldownMs);
        status("Sign-in email quota reached. Wait for Supabase to replenish it; the site cannot bypass this limit. Try any recent unused link instead.");
      }else if(/rate limit|too many requests|429/i.test(msg)){
        emailNotice="Supabase is temporarily limiting repeated sign-in requests.";
        setEmailCooldown(normalEmailCooldownMs);
        status("Too many sign-in requests. Please use your most recent unused email link or wait before retrying.");
      }else{
        emailNotice="Sign-in email could not be sent. Verify the address and Supabase Auth configuration before retrying.";
        status("Sign-in request failed: "+msg);
      }
    }finally{
      emailRequestInFlight=false;
      updateEmailButton();
    }
  });
  byId("aiSignOut").addEventListener("click",async()=>{
    try{const jwt=await getAccessToken();if(jwt)await api("/auth/v1/logout",{method:"POST",headers:headers(jwt)});}catch(_){}
    window.dispatchEvent(new CustomEvent("careerops:signed-out"));
    saveSession(null);activeResult=null;byId("aiResume").value="";byId("aiJd").value="";byId("aiConsent").checked=false;byId("aiResult").replaceChildren();byId("aiResult").hidden=true;byId("aiDownload").hidden=true;
    await refreshAuth();
  });
  let resumeParseInProgress=false;
  function showResumeFeedback() {
    // Open the panel immediately, including for failures. Previously the
    // Resume Lab event navigated only AFTER success, hiding all parse errors.
    document.querySelector('[data-nav="ai"]')?.click();
    byId("aiResumeParseStatus").scrollIntoView({behavior:"smooth",block:"center"});
  }
  function resumeFeedback(state,message) {
    const feedback=byId("aiResumeParseStatus");
    feedback.dataset.state=state;
    feedback.textContent=message;
  }
  async function loadResume(file) {
    if(!file) return false;
    showResumeFeedback();
    if(resumeParseInProgress) {
      resumeFeedback("error","A resume is already being extracted. Finish the current file first.");
      return false;
    }
    resumeParseInProgress=true;
    const picker=byId("aiResumeTxtFile");
    picker.disabled=true;
    const displayName=text(file.name,100)||"selected resume";
    resumeFeedback("loading","Processing "+displayName+" locally… PDF and DOCX extraction can take a little longer on mobile. No file is uploaded.");
    status("Parsing the selected resume in your browser…");
    try {
      const parser=window.CareerOpsResumeParser;
      if(!parser || typeof parser.parseFile!=="function") throw new Error("Resume parser did not load. Refresh the Career-Ops website and retry.");
      const result=await parser.parseFile(file);
      if(!result || typeof result.text!=="string") throw new Error("Parser did not return readable resume text.");
      byId("aiResume").value=result.text;
      prerequisites();
      const notes=Array.isArray(result.notes) && result.notes.length?" "+result.notes.join(" "):"";
      resumeFeedback("success","Resume extracted: "+result.text.length+" characters from "+text(result.filename,100)+"."+notes+" Review the text above before using AI.");
      status("Resume ready. Extraction only filled the text field; to generate an AI review, select a job, confirm consent, then tap Review job with AI.");
      window.dispatchEvent(new CustomEvent("careerops:resume-parse-result",{detail:{success:true,filename:displayName,characters:result.text.length}}));
      return true;
    } catch(e) {
      const reason=text(e?.message||e,300);
      resumeFeedback("error","Resume extraction failed: "+reason+" You can paste the resume text manually.");
      status("Resume extraction failed. The reason is shown under the resume upload button.");
      window.dispatchEvent(new CustomEvent("careerops:resume-parse-result",{detail:{success:false,filename:displayName,error:reason}}));
      return false;
    } finally {
      resumeParseInProgress=false;
      picker.disabled=false;
    }
  }
  byId("aiResumeTxtFile").addEventListener("change",async function(){
    const selected=this.files?.[0];
    try { await loadResume(selected); }
    finally { this.value=""; }
  });
  window.addEventListener("careerops:resume-selected",async event=>{
    await loadResume(event.detail?.file);
  });

  byId("aiFetchJob").addEventListener("click",async function(){
    const link=byId("aiJobUrl").value.trim();
    const feedback=byId("aiJobFetchStatus");
    if(!link){feedback.textContent="Paste an official Greenhouse, Ashby or Lever posting link.";return;}
    const jwt=await getAccessToken();
    if(!jwt){feedback.textContent="Please sign in to Career-Ops AI Studio before fetching a job.";await refreshAuth();return;}
    this.disabled=true;
    feedback.textContent="Retrieving the public job description from the employer's career board...";
    try {
      const response=await api("/functions/v1/careerops-ai-review",{
        method:"POST",headers:headers(jwt),
        body:JSON.stringify({action:"fetch_job",url:link})
      });
      const job=response.job;
      if(!job || typeof job.description!=="string" || job.description.length<120) {
        throw new Error("The employer API did not provide enough job-description text.");
      }
      byId("aiJd").value=job.description.slice(0,16000);
      if(job.title)byId("aiRole").value=job.title.slice(0,160);
      if(!byId("aiCompany").value.trim() && job.company)byId("aiCompany").value=job.company.slice(0,130);
      prerequisites();
      feedback.textContent="Fetched "+job.description.length+" characters from "+job.provider+" (public official board). Review the job requirements before using AI.";
      status("Employer job description loaded. Confirm the details and your resume before generating drafts.");
    }catch(e){
      feedback.textContent="Job fetch unavailable: "+text(e?.message||e,260)+" You can paste the full description manually.";
    }finally{this.disabled=false;}
  });
  byId("aiDownload").addEventListener("click",exportDraft);
  ["aiResume","aiJd","aiRole","aiConsent"].forEach(id=>byId(id).addEventListener(id==="aiConsent"?"change":"input",prerequisites));
  byId("aiCheckConnection").addEventListener("click",()=>checkReviewConnection());
  byId("aiAnalyze").addEventListener("click",async function(){
    const resume=byId("aiResume").value.trim();
    const jobDescription=byId("aiJd").value.trim();
    const jobTitle=byId("aiRole").value.trim();
    const employer=byId("aiCompany").value.trim();
    const missing = prerequisites();
    if(missing.length){status("Review cannot start. Missing: "+missing.join("; ")+".");
      if(resume.length<250)byId("aiResume").focus();
      else if(jobDescription.length<200)byId("aiJd").focus();
      else if(!jobTitle)byId("aiRole").focus();
      return;
    }
    const token=await getAccessToken();
    if(!token){status("Sign in again to review this job.");await refreshAuth();return;}
    if(!reviewReady && !(await checkReviewConnection(token)))return;
    this.disabled=true;activeResult=null;byId("aiDownload").hidden=true;
    const started=Date.now();
    const showProgress=()=>{
      const sec=Math.max(0,Math.floor((Date.now()-started)/1000));
      status("Gemini is preparing your review ("+sec+"s). The request may take up to 100 seconds. No application will be submitted. Please avoid tapping Review again.");
    };
    showProgress();
    const progressTimer=setInterval(showProgress,1000);
    try{
      const x=await api("/functions/v1/careerops-ai-review",{
        method:"POST",headers:headers(token),
        body:JSON.stringify({resume,jobDescription,jobTitle,employer})
      });
      if(!x.ok || !x.result)throw Error("No AI result returned.");
      renderResult(x.result);
      status("AI draft received. Check every claim, skill and figure before sending to any employer.");
      byId("aiResult").scrollIntoView({behavior:"smooth"});
    }catch(e){
      const err=text(e?.message||e,260);
      status("AI review failed: "+err);
    }finally{
      clearInterval(progressTimer);
      this.disabled=false;
    }
  });
  window.addEventListener("careerops:job-selected",event=>{
    const j=event.detail||{};
    byId("aiRole").value=text(j.title,170);
    byId("aiCompany").value=text(j.company,130);
    byId("aiJobUrl").value=text(j.url,1000);
    byId("aiJd").value=text(j.description,15000);
    byId("aiResult").hidden=true;byId("aiDownload").hidden=true;activeResult=null;
    prerequisites();
    status("Job selected. The public scanner may not contain the full job description; paste it here, add your resume and consent, then request AI review.");
    document.querySelector('[data-nav="ai"]')?.click();
  });
  try{const stored=sessionStorage.getItem(tokenKey);if(stored)session=JSON.parse(stored);}catch(_){session=null;}
  window.CareerOpsAuth = Object.freeze({getAccessToken:()=>getAccessToken()});
  readUrlSession();
  prerequisites();
  updateEmailButton();
  refreshAuth();
  checkGoogleProvider();
})();