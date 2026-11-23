/* Phase 13: deterministic, browser-local evidence matching. No AI claims or uploads. */
(function(root) {
  "use strict";
  const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9+#.]+/g," ").replace(/\s+/g," ").trim();
  const terms = value => Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/);
  const unique = items => [...new Set(items.map(x=>String(x||"").trim()).filter(Boolean))].slice(0,80);
  const contains = (haystack,needle) => {
    const h = " " + norm(haystack) + " ", n = norm(needle);
    return n.length >= 2 && h.includes(" " + n + " ");
  };
  function years(value) {
    const s = String(value||"").toLowerCase();
    const range = s.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/);
    if(range) return {min:Number(range[1]),max:Number(range[2]),known:true};
    const min = s.match(/(?:minimum|at least|min\.?|requires?)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/);
    if(min) return {min:Number(min[1]),max:null,known:true};
    const plus = s.match(/(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)/);
    if(plus) return {min:Number(plus[1]),max:null,known:true};
    const plain = s.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/);
    if(plain) return {min:Number(plain[1]),max:null,known:true};
    return {min:null,max:null,known:false};
  }
  function assess(job,profile) {
    const j=job||{},p=profile||{};
    const jobSkills=unique(terms(j.skills).concat(terms(j.requiredSkills)));
    const profileSkills=unique(terms(p.skills));
    const evidence=String(p.resumeText||"");
    const verified=profileSkills.filter(s=>contains(evidence,s));
    const claimedOnly=profileSkills.filter(s=>!verified.includes(s));
    const matched=jobSkills.filter(s=>verified.some(v=>norm(v)===norm(s)));
    const missing=jobSkills.filter(s=>!matched.includes(s));
    const req=years(j.requiredExperience), candidate=Number(p.experienceYears);
    const experienceKnown=req.known&&Number.isFinite(candidate)&&candidate>=0;
    const eligible=experienceKnown?(candidate<req.min?"below-minimum":req.max!==null&&candidate>req.max?"above-stated-range":"within-stated-range"):"unverified";
    const role=unique(terms(p.roles));
    const roleMatched=role.length>0&&role.some(t=>contains(j.title,t)||contains(t,j.title));
    const location=unique(terms(p.locations));
    const locationMatched=location.length>0&&location.some(t=>contains(j.location,t));
    const skillCoverage=jobSkills.length?matched.length/jobSkills.length:null;
    const observedWeights=[{weight:45,value:skillCoverage},{weight:30,value:role.length?Number(roleMatched):null},{weight:15,value:location.length?Number(locationMatched):null},{weight:10,value:experienceKnown?Number(eligible==="within-stated-range"):null}];
    const available=observedWeights.filter(x=>x.value!==null);
    const evidenceWeight=available.reduce((sum,x)=>sum+x.weight,0);
    const score=evidenceWeight?Math.round(available.reduce((sum,x)=>sum+x.weight*x.value,0)/evidenceWeight*100):null;
    return {score,confidence:evidenceWeight>=70?"more-evidence":"limited-evidence",experience:eligible,
      matchedSkills:matched,missingOrUnverifiedSkills:missing,unverifiedProfileSkills:claimedOnly,
      roleMatched:role.length?roleMatched:null,locationMatched:location.length?locationMatched:null,
      cautions:[...(eligible==="below-minimum"?["Candidate is below the stated minimum experience."]:[]),
        ...(!req.known?["Experience requirement not verified from the listing."]:[]),
        ...(!jobSkills.length?["No structured job skill requirements available."]:[]),
        ...(claimedOnly.length?["Profile skills absent from the supplied resume were not counted as verified."]:[])],
      method:"Evidence-based, local heuristic; not ATS score, AI screening, or eligibility guarantee."};
  }
  function draftSummary(job,profile) {
    const a=assess(job,profile),role=String(job?.title||"the role").slice(0,120);
    const evidence=String(profile?.resumeText||"").trim();
    if(evidence.length<80) return {draft:"",warnings:["Provide a readable resume before tailoring."]};
    const lines=evidence.split(/\n+/).map(s=>s.trim()).filter(s=>s.length>=20&&s.length<=300);
    const bullets=lines.filter(s=>a.matchedSkills.some(k=>contains(s,k))).slice(0,5);
    return {draft:bullets.join("\n"),warnings:["Extracted resume lines only; no new achievements or credentials added.","Review every line against the original resume before use."],targetRole:role};
  }
  const api={assess,draftSummary,years};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.CareerOpsEvidenceMatch=api;
})(typeof globalThis!=="undefined"?globalThis:this);
