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
  const text = (v,n=10000) => typeof v==="string" ? v.trim().slice(0,n) : "";
  const set = (id,message) => { byId(id).textContent = message; };
  const status = message => set("aiStatus",message);
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
      status(reviewReady ? "AI endpoint ready. Complete your resume and job description to generate drafts."
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
  function readUrlSession() {
    const hash=location.hash.startsWith("#") ? new URLSearchParams(location.hash.slice(1)) : null;
    if(!hash || !hash.get("access_token"))return;
    const expiry=Number(hash.get("expires_at")) || Math.floor(Date.now()/1000)+(Number(hash.get("expires_in"))||3600);
    saveSession({
      access_token:hash.get("access_token"),
      refresh_token:hash.get("refresh_token") || "",
      expires_at:expiry
    });
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
    if(!token){byId("aiWorkspace").hidden=true;byId("aiSignOut").hidden=true;status("Private backend configured. Sign in using your email to enable AI review.");return;}
    try{
      const user=await api("/auth/v1/user",{headers:headers(token)});
      set("aiSignedUser",user.email || "Signed in");
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
  byId("aiSendLink").addEventListener("click",async function(){
    const email=byId("aiEmail").value.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status("Enter a valid email address.");return;}
    this.disabled=true;
    try{
      await api("/auth/v1/otp?redirect_to="+encodeURIComponent(location.origin+location.pathname),{
        method:"POST",headers:headers(),body:JSON.stringify({email,create_user:true})
      });
      status("Sign-in link requested. Check your email and follow the link. Ensure this website is listed in the Supabase Auth redirect allowlist.");
    }catch(e){status("Sign-in failed: "+e.message);}finally{this.disabled=false;}
  });
  byId("aiSignOut").addEventListener("click",async()=>{
    try{const jwt=await getAccessToken();if(jwt)await api("/auth/v1/logout",{method:"POST",headers:headers(jwt)});}catch(_){}
    saveSession(null);activeResult=null;byId("aiResume").value="";byId("aiJd").value="";byId("aiConsent").checked=false;byId("aiResult").replaceChildren();byId("aiResult").hidden=true;byId("aiDownload").hidden=true;
    await refreshAuth();
  });
  byId("aiResumeTxtFile").addEventListener("change",async function(){
    const f=this.files?.[0];if(!f)return;
    if(!/\.txt$/i.test(f.name) || f.size>16000){status("Choose a plain-text .txt resume under 16 KB.");this.value="";return;}
    byId("aiResume").value=await f.text();
    prerequisites();
    status("Plain-text resume loaded locally; nothing uploaded.");
    this.value="";
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
      status("Gemini is preparing your review ("+sec+"s). The request may take up to 100 seconds. Please avoid tapping Review again.");
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
  readUrlSession();
  prerequisites();
  refreshAuth();
})();