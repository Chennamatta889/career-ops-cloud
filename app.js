/* Career-Ops dashboard: public read-only job feed + local rule-based priorities. No AI or automatic submissions. */
(function () {
  "use strict";
  // Old browser-wide storage is legacy only and requires explicit import.
  // Never automatically display it after a different Google account signs in.
  const LEGACY_STORAGE_KEY = "career-ops-workspace-v1";
  const GUEST_STORAGE_KEY = "career-ops-session-guest-v1";
  const ACCOUNT_STORAGE_PREFIX = "career-ops-session-account-v1-";
  let activeAccountId=null;
  let accountEpoch=0;
  const STAGES = [
    { name: "Saved", color: "#42dfb6" },
    { name: "Review", color: "#8cd9ff" },
    { name: "Applied", color: "#b4a7ff" },
    { name: "Interview", color: "#f5c782" },
    { name: "Offer", color: "#72e5a2" },
    { name: "Rejected", color: "#db8994" }
  ];
  const SAMPLE = [
    {id:"demo-1",title:"Software Developer",company:"Northstar Systems",location:"Hyderabad, India",skills:["JavaScript","SQL"],description:"Illustrative IT opening for software development and testing.",url:"",demo:true,stage:"",addedAt:"2026-11-20"},
    {id:"demo-2",title:"Sales Executive",company:"Orbit Commerce",location:"Mumbai, India",skills:["Communication","CRM"],description:"Illustrative non-IT position involving client outreach and sales.",url:"",demo:true,stage:"",addedAt:"2026-11-19"},
    {id:"demo-3",title:"Customer Support Associate",company:"Beacon Services",location:"Remote, India",skills:["Customer Service"],description:"Illustrative customer service and operations role.",url:"",demo:true,stage:"",addedAt:"2026-11-18"},
    {id:"demo-4",title:"Financial Accountant",company:"Mosaic Finance",location:"Delhi, India",skills:["Excel","Accounting"],description:"Illustrative finance and reporting role.",url:"",demo:true,stage:"",addedAt:"2026-11-17"},
    {id:"demo-5",title:"HR Recruiter",company:"Aster Talent",location:"Bengaluru, India",skills:["Recruiting"],description:"Illustrative HR position coordinating interviews and hiring.",url:"",demo:true,stage:"",addedAt:"2026-11-16"},
    {id:"demo-6",title:"Warehouse Operations Coordinator",company:"Pioneer Logistics",location:"Chennai, India",skills:["Logistics"],description:"Illustrative logistics and inventory role.",url:"",demo:true,stage:"",addedAt:"2026-11-15"}
  ];
  const DEFAULT_PREFS = {roles:"",locations:"",experience:"",skills:""};
  const $ = function (id) { return document.getElementById(id); };
  const readableJobText=function(raw,max=6000){
    return window.CareerOpsJobText?.plainText?.(raw,max)||
      (typeof raw==="string"?raw.slice(0,max).trim():"");
  };
  const categoryApi=window.CareerOpsCategories;
  const jobCategory=function(j){
    const provided=typeof j?.category==="string"?j.category:"";
    if(categoryApi?.categories?.includes(provided))return provided;
    return categoryApi?.classify?.(String(j?.title||""),String(j?.department||""))||"Other";
  };
  const copy = function (x) { return JSON.parse(JSON.stringify(x)); };
  const escapeHtml = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  const safeUrl = function (v) { try { const u = new URL(String(v)); return (u.protocol === "http:" || u.protocol === "https:") ? u.href : ""; } catch (_) { return ""; } };
  const str = function (v) { return (typeof v === "string" || typeof v === "number") ? String(v).trim() : ""; };
  const newId = function () { return "job-" + Date.now() + "-" + Math.random().toString(36).slice(2,9); };
  // Bound the DOM work without reducing the total number of searchable jobs.
  const DISCOVER_PAGE_SIZE = 30;
  let discoverVisibleCount = DISCOVER_PAGE_SIZE;
  const normalizeSearch = function(value) {
    return String(value == null ? "" : value).normalize("NFKC").toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
  };
  let memoryOnly = false;
  const defaultState = function () { return { mode: "demo", jobs: copy(SAMPLE), prefs: copy(DEFAULT_PREFS), activity: [], importedAt: null, feedGeneratedAt: null }; };
  const load = function (storageKey,storage=sessionStorage) {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return defaultState();
      const x = JSON.parse(raw);
      if (!x || !Array.isArray(x.jobs)) return defaultState();
      return {
        mode: ["imported","manual","live"].includes(x.mode) ? x.mode : "demo",
        jobs: x.jobs.slice(0,500).map(function (j) {
          return { id: str(j.id) || newId(), title: str(j.title), company: str(j.company), location: str(j.location), category:jobCategory(j), department:str(j.department), skills: Array.isArray(j.skills) ? j.skills.slice(0,12).map(str) : [], description: readableJobText(j.description,6000), url: safeUrl(j.url), demo: !!j.demo, manual: !!j.manual || (x.mode === "manual" && !j.demo), source: str(j.source), requiredExperience: str(j.requiredExperience), stage: STAGES.some(function (s) { return s.name === j.stage; }) ? j.stage : "", addedAt: str(j.addedAt) };
        }),
        prefs: Object.assign({}, DEFAULT_PREFS, x.prefs || {}),
        activity: Array.isArray(x.activity) ? x.activity.slice(0,100) : [],
        importedAt: str(x.importedAt) || null,
        feedGeneratedAt: str(x.feedGeneratedAt) || null
      };
    } catch (_) { memoryOnly = true; return defaultState(); }
  };
  let state = load(GUEST_STORAGE_KEY);
  let activeJobId = null;
  const save = function () {
    try {
      sessionStorage.setItem(activeAccountId?ACCOUNT_STORAGE_PREFIX+activeAccountId:GUEST_STORAGE_KEY,JSON.stringify(state));
    } catch (_) { memoryOnly = true; }
  };
  const stamp = function () { return new Date().toISOString(); };
  const log = function (title, detail) {
    state.activity.unshift({ title: String(title), detail: String(detail || ""), at: stamp() });
    state.activity = state.activity.slice(0,100);
  };
  let toastTimer = null;
  const toast = function (message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3500);
  };
  const pageNames = {
    overview:"Overview",discover:"Find jobs",applications:"My applications",
    resume:"Resume & preferences",ai:"AI Studio",activity:"Activity",settings:"Settings"
  };
  let currentPage="";
  const authFragment = function() {
    return /^#(?:access_token=|refresh_token=|error=|error_code=)/.test(location.hash);
  };
  const pageFromLocation = function() {
    // OAuth fragment must remain untouched until ai-studio.js consumes it.
    if(authFragment())return "ai";
    const route=String(location.hash||"").slice(1);
    return Object.prototype.hasOwnProperty.call(pageNames,route)?route:"overview";
  };
  const hideMobileMenu = function () {
    $("sidebar").classList.remove("open"); $("mobileScrim").classList.remove("show");
    $("mobileMenu").setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-open");
  };
  const closeOpenDialogs = function(){
    for(const id of ["jobDialog","addDialog"]){
      const dialog=$(id);
      if(dialog?.open)dialog.close();
    }
  };
  const showPage = function (name, options) {
    const opts=options||{};
    const route=Object.prototype.hasOwnProperty.call(pageNames,name)?name:"overview";
    const changed=currentPage!==route;
    // Every deliberate navigation is a browser history entry. Rendering a
    // Back/Forward route must never rewrite history or create a navigation loop.
    const hash="#"+route;
    if(!authFragment() && location.hash!==hash){
      const url=location.pathname+location.search+hash;
      if(opts.history==="replace")history.replaceState({careeropsPage:route},"",url);
      else if(opts.history!=="none")history.pushState({careeropsPage:route},"",url);
    }
    currentPage=route;
    document.querySelectorAll(".page").forEach(function (el) {
      const active=el.id==="page-"+route;
      el.classList.toggle("active",active);
      el.setAttribute("aria-hidden",active?"false":"true");
    });
    document.querySelectorAll(".nav-link").forEach(function (el) {
      const active=el.getAttribute("data-nav")===route;
      el.classList.toggle("active",active);
      if(active)el.setAttribute("aria-current","page");
      else el.removeAttribute("aria-current");
    });
    $("currentCrumb").textContent=pageNames[route];
    document.title=pageNames[route]+" | Career-Ops";
    hideMobileMenu();
    if(changed){
      closeOpenDialogs();
      if(opts.scroll!==false)window.scrollTo({top:0,behavior:"instant"});
    }
  };
  const syncHistoryRoute = function(){
    showPage(pageFromLocation(),{history:"none",scroll:false});
  };
  const priority = function (job) { return window.CareerOpsMatch.rank(job,state.prefs); };
  const visibleJobs = function () {
    const searchTerms=normalizeSearch($("jobSearch").value).split(" ").filter(Boolean);
    const category=$("categoryFilter").value;
    const sector=$("sectorFilter").value;
    const location=$("locationFilter").value.toLowerCase();
    const sort=$("sortFilter").value;
    const priorityFilter=$("matchFilter").value;
    return state.jobs.filter(function(job){
      const all=normalizeSearch([job.title,job.company,job.location,job.description,job.department,jobCategory(job)]
        .concat(job.skills||[]).join(" "));
      const loc=String(job.location||"").toLowerCase();
      const kind=jobCategory(job);
      const categoryOk=!category||kind===category;
      const sectorOk=!sector||(sector==="it" ? kind==="IT & Software" : kind!=="IT & Software");
      const locationOk=!location||loc.includes(location)||
        (location==="india" && /india|hyderabad|bengaluru|bangalore|mumbai|delhi|pune|chennai|noida|gurugram|gurgaon|kolkata|ahmedabad|kochi/.test(loc))||
        (location==="bengaluru"&&loc.includes("bangalore"));
      const points=priority(job).score;
      const priorityOk=priorityFilter==="all"||
        (priorityFilter==="below"?points<50:points>=Number(priorityFilter));
      return searchTerms.every(function(term){return all.includes(term);})&&categoryOk&&sectorOk&&locationOk&&priorityOk;
    }).sort(function(a,b){
      if(sort==="priority")return priority(b).score-priority(a).score||
        String(b.addedAt||"").localeCompare(String(a.addedAt||""));
      if(sort==="company")return a.company.localeCompare(b.company);
      if(sort==="role")return a.title.localeCompare(b.title);
      return String(b.addedAt||"").localeCompare(String(a.addedAt||""));
    });
  };
  const companyInitials = function (company) {
    const bits = String(company).split(/\s+/).filter(Boolean);
    return (bits.length >= 2 ? bits[0][0] + bits[1][0] : String(company).slice(0,2)).toUpperCase();
  };
  // A public board may expose an update date rather than the original posting date.
  // Never mislabel a feed's retrieval time as the job's publication date.
  const listingSourceDate = function (j) {
    const raw=str(j.addedAt).slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return "date not provided";
    const day=new Date(raw+"T12:00:00Z");
    if(!Number.isFinite(day.valueOf()) || day.toISOString().slice(0,10)!==raw)return "date not provided";
    return day.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
  };
  const jobSource = function (j) {
    return j.demo ? "Example listing" :
      j.source === "cloud" ? "Public employer posting · Source date: "+listingSourceDate(j) :
      (j.url ? "Original job link available" : "Manually added");
  };
  const chips = function (skills) { return (skills || []).slice(0,5).map(function (s) { return '<span class="skill-chip">' + escapeHtml(s) + '</span>'; }).join(""); };
  const find = function (id) { return state.jobs.find(function (j) { return j.id === id; }); };
  const priorityBadge = function(j){
    if(!state.prefs.roles.trim()&&!state.prefs.locations.trim()&&!state.prefs.skills.trim())
      return "";
    const fit=priority(j);
    return '<span class="match '+(fit.quality==="Limited evidence"?"limited":"")+
      '" title="'+escapeHtml(fit.quality+" · rule-based personal priority, not AI")+'">'+
      (j.demo?"Sample ":"Priority ")+fit.score+"/100</span>";
  };
  const overviewRow = function (j) {
    return '<div class="overview-row"><div class="company-symbol">' + escapeHtml(companyInitials(j.company)) + '</div><div class="overview-row-copy"><strong>' + escapeHtml(j.title) + '</strong><p>' + escapeHtml(j.company) + ' · ' + escapeHtml(j.location) + '</p></div>' + priorityBadge(j) +
      '<button class="overview-open" data-action="details" data-id="' + escapeHtml(j.id) + '" aria-label="Details for ' + escapeHtml(j.title) + '">↗</button></div>';
  };
  const card = function (j) {
    const url = safeUrl(j.url);
    const fit = priority(j);
    const showPersonalRanking=Boolean(
      state.prefs.roles.trim()||state.prefs.locations.trim()||state.prefs.skills.trim()
    );
    const ranking=showPersonalRanking?
      '<div class="card-priority-row">'+priorityBadge(j)+
      '<span class="priority-quality">'+escapeHtml(fit.quality)+'</span></div>':"";
    const categoryName=jobCategory(j);
    const details = '<button class="text-link secondary-link" type="button" data-action="details" data-id="' + escapeHtml(j.id) + '">View details</button>';
    const aiReview = '<button class="text-link open-job-link" type="button" data-action="ai" data-id="' + escapeHtml(j.id) + '">Review with AI</button>';
    const open = url
      ? '<a class="text-link open-job-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" aria-label="Open job listing for ' + escapeHtml(j.title) + ' at ' + escapeHtml(j.company) + '">Open listing ↗</a>'
      : '<span class="no-url-label">' + (j.demo ? 'Sample job — no link' : 'Posting link unavailable') + '</span>';
    return '<article class="job-card"><div class="job-card-top"><div class="company-symbol">' + escapeHtml(companyInitials(j.company)) + '</div><button class="save-button ' + (j.stage ? 'saved' : '') + '" data-action="save" data-id="' + escapeHtml(j.id) + '">' + (j.stage ? '✓ Tracking' : '+ Save') + '</button></div>' + ranking + '<h3>' + escapeHtml(j.title) + '</h3><p class="company-line">' + escapeHtml(j.company) + ' · ' + escapeHtml(j.location) + '</p><p class="description">' + escapeHtml(readableJobText(j.description,220) || 'A description is not available in this listing. Open the employer website for details.') + '</p><div class="chip-wrap"><span class="skill-chip category-chip">' + escapeHtml(categoryName) + '</span>' + chips(j.skills) + '</div><div class="card-footer"><span class="job-date">' + escapeHtml(jobSource(j)) + '</span><div class="card-action-group">' + details + aiReview + open + '</div></div></article>';
  };
  const pipelineCount = function (stage) { return state.jobs.filter(function (j) { return j.stage === stage; }).length; };
  const renderOverview = function () {
    $("statDiscovered").textContent = state.jobs.length;
    $("statSaved").textContent = pipelineCount("Saved") + pipelineCount("Review");
    $("statApplied").textContent = ["Applied","Interview","Offer","Rejected"].reduce(function (n,s) { return n + pipelineCount(s); },0);
    $("statInterviews").textContent = pipelineCount("Interview");
    $("navJobsCount").textContent = state.jobs.length;
    const top = state.jobs.slice().sort(function (a,b) { return String(b.addedAt||"").localeCompare(String(a.addedAt||"")); }).slice(0,4);
    $("overviewJobs").innerHTML = top.length ? top.map(overviewRow).join("") : '<p class="muted">No opportunities yet. Add a job or import scan results.</p>';
    const total = STAGES.reduce(function (n,s) { return n + pipelineCount(s.name); },0);
    $("pipelineChart").innerHTML = STAGES.map(function (s) { const n = pipelineCount(s.name); return n ? '<span class="pipeline-bar" style="background:' + s.color + ';flex:' + n + '"></span>' : ''; }).join("");
    $("pipelineLegend").innerHTML = STAGES.map(function (s) { return '<div class="legend-item"><span><i style="background:' + s.color + '"></i>' + s.name + '</span><b>' + pipelineCount(s.name) + '</b></div>'; }).join("");
    if (!total) $("pipelineChart").title = "No tracked opportunities yet";
    const notice = document.querySelector("#page-overview .notice");
    if (state.mode === "demo") {
      notice.querySelector("div").innerHTML = '<strong>Example listings</strong> — these are illustrative roles, not published vacancies. Employer listings are loaded separately when available.';
    } else if (state.mode === "live") {
      notice.querySelector("div").innerHTML = '<strong>Employer job listings</strong> — openings are sourced from public career boards and updated on a schedule. Check the original posting before applying. No applications are submitted automatically.';
    } else {
      notice.querySelector("div").innerHTML = '<strong>Your saved job list</strong> — this view includes roles you added or imported. Verify details on the employer website before taking action.';
    }
  };
  const renderDiscover = function () {
    // Personalized score filters should never hide every job when the
    // candidate hasn't configured a target role/location/skill yet.
    const hasPreferences=Boolean(
      state.prefs.roles.trim()||state.prefs.locations.trim()||state.prefs.skills.trim()
    );
    $("matchFilter").disabled=!hasPreferences;
    if(!hasPreferences)$("matchFilter").value="all";
    const jobs = visibleJobs();
    const showing=Math.min(jobs.length,discoverVisibleCount);
    $("jobsGrid").innerHTML = jobs.slice(0,showing).map(card).join("");
    $("resultsCount").textContent = jobs.length + (jobs.length === 1 ? " job listing" : " job listings") +
      (showing<jobs.length ? " · showing "+showing : "");
    $("emptyJobs").hidden = jobs.length !== 0;
    $("loadMoreJobs").hidden=showing>=jobs.length;
    $("loadMoreJobs").textContent="Show more jobs ("+(jobs.length-showing)+" remaining)";
    $("resetDiscoverFilters").hidden=!Boolean(
      $("jobSearch").value.trim() || $("sectorFilter").value ||
      $("categoryFilter").value || $("locationFilter").value ||
      $("matchFilter").value!=="all" || $("sortFilter").value!=="newest"
    );
    $("dataModeTag").textContent = state.mode === "demo" ? "Examples" : state.mode === "live" ? "Published vacancies" : "Your job list";
    $("dataModeTag").classList.toggle("real", state.mode !== "demo");
  };
  const renderBoard = function () {
    $("applicationsBoard").innerHTML = STAGES.map(function (s) {
      const jobs = state.jobs.filter(function (j) { return j.stage === s.name; });
      return '<section class="board-column"><div class="board-heading"><i style="background:' + s.color + '"></i><strong>' + s.name + '</strong><b>' + jobs.length + '</b></div>' + (jobs.length ? jobs.map(function (j) {
        return '<article class="board-card"><strong>' + escapeHtml(j.title) + '</strong><p>' + escapeHtml(j.company) + '</p><label><span class="muted small">Update status</span><select data-stage-id="' + escapeHtml(j.id) + '" aria-label="Change status for ' + escapeHtml(j.title) + '">' + ['Not tracking'].concat(STAGES.map(function (x) { return x.name; })).map(function (name) { const val = name === "Not tracking" ? "" : name; return '<option value="' + escapeHtml(val) + '"' + (val === j.stage ? ' selected' : '') + '>' + escapeHtml(name) + '</option>'; }).join("") + '</select></label></article>';
      }).join("") : '<div class="board-empty">No jobs in this stage</div>') + '</section>';
    }).join("");
  };
  const renderActivity = function () {
    $("activityList").innerHTML = state.activity.length ? state.activity.map(function (a) {
      const date = new Date(a.at);
      const when = Number.isNaN(date.valueOf()) ? "" : date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
      return '<div class="activity-row"><span class="activity-dot">✓</span><div><strong>' + escapeHtml(a.title) + '</strong><p>' + escapeHtml(a.detail) + (a.detail ? " · " : "") + escapeHtml(when) + '</p></div></div>';
    }).join("") : '<div class="empty-state"><div class="empty-icon">◷</div><h3>No activity yet</h3><p>Your saved jobs, imports, and status changes will appear here.</p></div>';
  };
  const renderPreferences = function () {
    // Background updates should never overwrite a form someone is editing.
    if($("preferencesForm")?.contains?.(document.activeElement))return;
    $("targetRoles").value = str(state.prefs.roles);
    $("targetLocations").value = str(state.prefs.locations);
    $("targetExperience").value = str(state.prefs.experience);
    $("targetSkills").value = str(state.prefs.skills);
  };
  const render = function () { renderOverview(); renderDiscover(); renderBoard(); renderActivity(); renderPreferences(); };
  const broadcastStage = function(job) {
    if(!job || job.demo) return;
    window.dispatchEvent(new CustomEvent("careerops:tracking-changed",{detail:{job:{
      job_key:privateJobKey(job),title:job.title,company:job.company,location:job.location,url:job.url,stage:job.stage
    }}}));
  };
  const track = function (id) {
    const job = find(id); if (!job) return;
    if (job.stage && job.stage !== "Saved") { toast("This job is marked " + job.stage + ". Update its status in My applications."); return; }
    job.stage = job.stage === "Saved" ? "" : "Saved";
    log(job.stage ? "Job saved" : "Job removed from shortlist", job.title + " · " + job.company);
    save(); render(); broadcastStage(job); toast(job.stage ? "Job saved to My applications" : "Job removed from saved listings");
  };
  const openDetails = function (id) {
    const j = find(id); if (!j) return; activeJobId = id;
    $("dialogEyebrow").textContent = j.demo ? "EXAMPLE LISTING" : "JOB DETAILS";
    $("dialogTitle").textContent = j.title;
    $("dialogMeta").textContent = j.company + " · " + j.location;
    const fullDescription=readableJobText(j.description,6000);
    $("dialogDescription").textContent=fullDescription||
      "A job description is not available. Check the original employer posting for complete requirements.";
    const sourceNote=$("dialogDescriptionNote");
    sourceNote.hidden=!(j.source==="cloud" && !!safeUrl(j.url));
    if(!sourceNote.hidden)sourceNote.textContent=
      "Description excerpt from the published employer board. The original posting contains the most complete and current details.";
    $("dialogSkills").innerHTML = chips(j.skills);
    const fit = priority(j);
    const signalRow = function (title, result, total) {
      return '<div class="priority-factor"><div><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(result.detail) +
        '</p></div><span>+' + result.points + '/' + total + '</span></div>';
    };
    const priorityConfigured=Boolean(
      state.prefs.roles.trim()||state.prefs.locations.trim()||state.prefs.skills.trim()
    );
    // Hide the entire ranking panel unless the candidate asked for
    // personalized job priorities. The full description remains the focus.
    $("matchExplanation").hidden=!priorityConfigured;
    $("matchExplanation").innerHTML=priorityConfigured ?
      '<div class="priority-head"><div><span class="eyebrow">PERSONALIZED PRIORITY</span><h3>' +
      (j.demo ? 'Example ' : '') + fit.score + '/100</h3></div><span class="priority-quality">' + escapeHtml(fit.quality) +
      '</span></div>' + signalRow("Target role",fit.role,50) + signalRow("Location",fit.location,30) +
      signalRow("Skills mentioned",fit.skills,20) + '<div class="priority-experience">' +
      escapeHtml(fit.experience) + '</div><p class="priority-disclaimer">' + escapeHtml(fit.method) + '</p>' : "";
    const url = safeUrl(j.url);
    $("dialogSource").textContent = url ? jobSource(j) + " · opens on the employer website"
      : (j.demo ? "Sample job: this is not a real listing, so there is no external URL."
      : "This job record has no valid posting URL. Open the employer's career site to locate it.");
    $("dialogSave").textContent = j.stage ? "✓ Tracking" : "+ Save job";
    $("dialogLink").hidden = !url;
    const report=$("dialogReport");
    report.hidden=j.demo || !url;
    if(!report.hidden){
      report.href="mailto:mchennarao889@gmail.com?subject="+
        encodeURIComponent("Career-Ops listing report")+"&body="+
        encodeURIComponent("Please check this public job listing.\nCompany: "+j.company+
        "\nRole: "+j.title+"\nPosting: "+url+"\nIssue (broken, expired or suspicious):\n");
    }else report.removeAttribute("href");
    if (url) {
      $("dialogLink").href = url;
      $("dialogLink").setAttribute("aria-label", "Open original job listing at " + j.company);
    } else {
      $("dialogLink").removeAttribute("href");
      $("dialogLink").removeAttribute("aria-label");
    }
    $("jobDialog").showModal();
  };
  const setStage = function (id, stage) {
    const j = find(id); if (!j) return;
    if (stage && !STAGES.some(function (s) { return s.name === stage; })) return;
    const previous = j.stage;
    j.stage = stage;
    log("Application status changed", j.title + " · " + (previous || "Not tracking") + " → " + (stage || "Not tracking"));
    save(); render(); broadcastStage(j); toast("Status updated — syncing when signed in");
  };
  const normalise = function (j) {
    if (!j || typeof j !== "object") return null;
    const title = str(j.title || j.job_title || j.role || j.position || j.jobTitle);
    const company = str(typeof j.company === "object" ? (j.company && (j.company.name || j.company.title)) : (j.company || j.employer || j.company_name || j.organization));
    if (!title || !company) return null;
    let locationValue = j.location || j.city || j.job_location || j.location_name || "";
    if (locationValue && typeof locationValue === "object") locationValue = locationValue.name || locationValue.city || locationValue.display_name || "";
    let skills = j.skills || j.technologies || j.tags || [];
    if (typeof skills === "string") skills = skills.split(",");
    if (!Array.isArray(skills)) skills = [];
    return {
      id: newId(), title: title.slice(0,160), company: company.slice(0,120),
      location: str(locationValue).slice(0,120) || "Not specified",
      category:jobCategory({title,category:j.category,department:j.department}),
      department:str(j.department).slice(0,130),
      skills: skills.map(str).filter(Boolean).slice(0,12),
      description: readableJobText(str(j.description || j.summary || j.job_description || ""),6000),
      requiredExperience: str(j.requiredExperience || j.required_experience || j.experience_requirement || "").slice(0,100),
      url: safeUrl(j.apply_url || j.job_url || j.url || j.link || j.source_url),
      demo: false, manual: false, source: "import", stage: "",
      addedAt: /^\d{4}-\d{2}-\d{2}/.test(str(j.posted_at||j.published_at||j.addedAt)) ?
        str(j.posted_at||j.published_at||j.addedAt).slice(0,10) : ""
    };
  };
  const extractJobs = function (data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    for (const k of ["jobs","matches","results","discovered_jobs","matched_jobs","opportunities","listings"]) {
      if (Array.isArray(data[k])) return data[k];
      if (data.data && Array.isArray(data.data[k])) return data.data[k];
    }
    return [];
  };
  const importJson = async function (file) {
    if (!file) return;
    if (file.size > 8*1024*1024) { toast("Import file is too large (8 MB limit)"); return; }
    try {
      const parsed = JSON.parse(await file.text());
      const raw = extractJobs(parsed);
      const seen = new Set();
      const jobs = raw.slice(0,1000).map(normalise).filter(function (j) {
        if (!j) return false;
        const key = j.url || (j.company + "/" + j.title + "/" + j.location).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0,500);
      if (!jobs.length) throw new Error("No job records found. This file may be a summary-only scan receipt.");
      const keep = state.jobs.filter(function (j) { return !j.demo && !!j.stage; });
      const kept = new Map();
      keep.forEach(function (j) { kept.set(j.url || (j.company + "/" + j.title + "/" + j.location).toLowerCase(), j.stage); });
      jobs.forEach(function (j) { const key = j.url || (j.company + "/" + j.title + "/" + j.location).toLowerCase(); j.stage = kept.get(key) || ""; });
      const importedKeys = new Set(jobs.map(function (j) { return j.url || (j.company + "/" + j.title + "/" + j.location).toLowerCase(); }));
      const previousTrackedJobs = keep.filter(function (j) { return !importedKeys.has(j.url || (j.company + "/" + j.title + "/" + j.location).toLowerCase()); });
      // Keep tracked roles when the incoming scan reaches the 500-job display cap.
      const pinned = jobs.filter(function(j){return !!j.stage;}).concat(previousTrackedJobs);
      state.jobs = jobs.filter(function(j){return !j.stage;})
        .slice(0,Math.max(0,500-pinned.length)).concat(pinned).slice(0,500);
      state.mode = "imported";
      state.importedAt = stamp();
      log("Scan results imported", jobs.length + " unique job records from " + file.name);
      save(); render(); $("importMessage").textContent = "Imported " + jobs.length + " jobs from " + file.name + " · not a live connection";
      toast(jobs.length + " jobs imported"); showPage("discover");
    } catch (err) {
      $("importMessage").textContent = err.message || "Import failed.";
      toast("Import failed: " + (err.message || "invalid JSON"));
    }
  };
  document.addEventListener("click", function (e) {
    const nav = e.target.closest("[data-nav]");
    if (nav) { e.preventDefault(); showPage(nav.getAttribute("data-nav")); return; }
    const action = e.target.closest("[data-action]");
    if (action) {
      const id = action.getAttribute("data-id");
      if (action.getAttribute("data-action") === "details") openDetails(id);
      if (action.getAttribute("data-action") === "save") track(id);
      if (action.getAttribute("data-action") === "ai") {
        const job = find(id);
        if (job) window.dispatchEvent(new CustomEvent("careerops:job-selected", {detail:{
          title:job.title,company:job.company,url:job.url,description:readableJobText(job.description,6000)
        }}));
      }
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches("[data-stage-id]")) setStage(e.target.getAttribute("data-stage-id"), e.target.value);
  });
  ["jobSearch","sectorFilter","categoryFilter","locationFilter","matchFilter","sortFilter"].forEach(function (id) {
    $(id).addEventListener(id==="jobSearch"?"input":"change",function(){
      discoverVisibleCount=DISCOVER_PAGE_SIZE;
      renderDiscover();
    });
  });
  const resetDiscovery = function(){
    $("jobSearch").value="";
    $("categoryFilter").value="";
    $("sectorFilter").value="";
    $("locationFilter").value="";
    $("matchFilter").value="all";
    $("sortFilter").value="newest";
    discoverVisibleCount=DISCOVER_PAGE_SIZE;
    renderDiscover();
  };
  $("clearFilters").addEventListener("click",resetDiscovery);
  $("resetDiscoverFilters").addEventListener("click",resetDiscovery);
  $("loadMoreJobs").addEventListener("click",function(){
    discoverVisibleCount+=DISCOVER_PAGE_SIZE;
    renderDiscover();
  });
  $("mobileMenu").addEventListener("click", function () {
    const open=$("sidebar").classList.toggle("open");
    $("mobileScrim").classList.toggle("show",open);
    document.body.classList.toggle("nav-open",open);
    $("mobileMenu").setAttribute("aria-expanded",String(open));
    $("mobileMenu").setAttribute("aria-label",open?"Close navigation":"Open navigation");
  });
  window.addEventListener("keydown",function(event){
    if(event.key==="Escape" && $("sidebar").classList.contains("open"))hideMobileMenu();
  });
  $("mobileScrim").addEventListener("click", hideMobileMenu);
  // popstate handles history.pushState entries; hashchange also handles links
  // or manual URL edits. Idempotent rendering prevents duplicate transitions.
  window.addEventListener("popstate",syncHistoryRoute);
  window.addEventListener("hashchange",syncHistoryRoute);
  window.addEventListener("pageshow",function(event){
    if(event.persisted)syncHistoryRoute(); // browser back-forward cache
  });
  $("openAddJob").addEventListener("click", function () { $("addDialog").showModal(); });
  $("closeDialog").addEventListener("click", function () { $("jobDialog").close(); });
  $("closeAddDialog").addEventListener("click", function () { $("addDialog").close(); });
  $("dialogAI").addEventListener("click", function () { const job=find(activeJobId); $("jobDialog").close(); if(job) window.dispatchEvent(new CustomEvent("careerops:job-selected",{detail:{title:job.title,company:job.company,url:job.url,description:readableJobText(job.description,6000)}})); });
  $("dialogSave").addEventListener("click", function () { if (activeJobId) { track(activeJobId); const j = find(activeJobId); $("dialogSave").textContent = j && j.stage ? "✓ Tracking" : "+ Save job"; } });
  $("addJobForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = str(form.get("title")), company = str(form.get("company"));
    if (!title || !company) return;
    const rawUrl = str(form.get("url"));
    const url = safeUrl(rawUrl);
    if (rawUrl && !url) { toast("Please enter a valid http(s) job URL"); return; }
    const job = { id:newId(),title:title.slice(0,160),company:company.slice(0,120),location:str(form.get("location")) || "Not specified",category:jobCategory({title}),skills:str(form.get("skills")).split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0,12),description:readableJobText(str(form.get("description")),6000),url:url,demo:false,manual:true,source:"manual",stage:"Saved",addedAt:stamp() };
    if (state.mode === "demo") state.jobs = state.jobs.filter(function (j) { return !j.demo; });
    state.jobs.unshift(job); if (state.mode !== "live") state.mode = "manual";
    log("Opportunity added", title + " · " + company);
    save(); render(); $("addJobForm").reset(); $("addDialog").close(); toast("Opportunity added to your pipeline");
  });
  $("preferencesForm").addEventListener("submit", function (e) {
    e.preventDefault();
    state.prefs = { roles:$("targetRoles").value.trim(),locations:$("targetLocations").value.trim(),experience:$("targetExperience").value.trim(),skills:$("targetSkills").value.trim() };
    log("Preferences updated","Target role and skill preferences were saved locally");
    save(); render(); toast("Preferences saved; priorities recalculated");
  });
  $("resumeFile").addEventListener("change", function (e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/\.(pdf|docx|txt)$/i.test(f.name)) { toast("Choose a PDF, DOCX or TXT resume"); e.target.value = ""; return; }
    if (f.size > 6*1024*1024 || !f.size) { toast("Resume must be between 1 byte and 6 MB"); e.target.value = ""; return; }
    $("resumeFileLabel").textContent = f.name + " · opening AI Studio to extract";
    window.dispatchEvent(new CustomEvent("careerops:resume-selected",{detail:{file:f}}));
    // Keep the File handle valid until parsing completes. This matters for
    // Android document providers that may revoke temporary file access early.
  });
  window.addEventListener("careerops:resume-parse-result",function(event){
    const result=event.detail||{};
    $("resumeFile").value="";
    if(result.success){
      $("resumeFileLabel").textContent=(result.filename||"Resume")+" · "+result.characters+" characters extracted";
      toast("Resume extracted successfully — review the text in AI Studio");
    } else {
      $("resumeFileLabel").textContent=(result.filename||"Resume")+" · extraction failed; see AI Studio";
      toast("Resume extraction failed — see the detailed message in AI Studio");
    }
  });
  $("scanImport").addEventListener("change", function (e) {
    const f = e.target.files && e.target.files[0]; importJson(f); e.target.value = "";
  });
  $("exportData").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify({exportedAt:stamp(),workspace:state},null,2)],{type:"application/json"});
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = href; a.download = "career-ops-workspace.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(href); },1000); toast("Workspace exported");
  });
  $("resetWorkspace").addEventListener("click", function () {
    if (!confirm("Reset this browser's Career-Ops jobs, statuses and preferences? This cannot be undone.")) return;
    state = defaultState(); save(); $("importMessage").textContent = "No file imported. You can upload job listings in JSON format."; $("resumeFileLabel").textContent = "No file selected"; render(); showPage("overview"); toast("Browser workspace reset. Published job listings will reload."); syncCloudFeed(false);
  });
  $("clearActivity").addEventListener("click", function () {
    if (!state.activity.length) return;
    if (!confirm("Clear this browser's activity history?")) return;
    state.activity = []; save(); renderActivity(); toast("Activity cleared");
  });

  // Public feed: scanner execution happens on the GitHub Actions runner, never
  // in the browser. Only public employer job URLs and labels are transported.
  const feedKey = function (j) {
    return j.url || (j.company + "/" + j.title + "/" + j.location).toLowerCase();
  };
  const showFeedStatus = function (kind, title, description) {
    $("feedIndicator").className = "feed-indicator" +
      (kind === "success" ? " ok" : kind === "partial" ? " partial" : kind === "failed" ? " offline" : "");
    const pill=$("headerFeedStatus");
    if(pill)pill.dataset.state=kind;
    const pillLabel=$("headerFeedLabel");
    if(pillLabel)pillLabel.textContent={
      loading:"Checking listings",success:"Listings available",
      partial:"Partial update",failed:"Update unavailable"
    }[kind]||"Published job feed";
    $("feedTitle").textContent = title;
    $("feedText").textContent = description;
  };
  const syncCloudFeed = async function (requestedByUser) {
    const startingEpoch=accountEpoch;
    $("refreshCloud").disabled = true;
    showFeedStatus("loading", "Loading published listings", "Retrieving the latest available employer-board feed.");
    try {
      const response = await fetch("./data/jobs.json?v=" + Date.now(), {cache:"no-store"});
      if (!response.ok) throw new Error("HTTP " + response.status);
      const feed = await response.json();
      // A previous account's in-flight fetch must not overwrite the new account.
      if(startingEpoch!==accountEpoch)return;
      if (!feed || feed.schema !== "careerops.public-jobs.v1" || !Array.isArray(feed.jobs)
        || !feed.scan || !["success","partial","failed"].includes(feed.scan.status)) {
        throw new Error("Unsupported scanner feed format");
      }
      const runTime = new Date(feed.generated_at);
      if (!Number.isFinite(runTime.valueOf())) throw new Error("Scanner date is invalid");
      const lastRun = runTime.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
      const scan = feed.scan;
      const numErrors = Number(scan.error_count) || 0;
      const summary = "Last published update: " + lastRun + " · " + (Number(scan.scanned) || 0) + " employer boards checked · " + (Number(scan.found) || 0) + " listings reviewed · " + numErrors + " unavailable sources";
      const feedAgeMs=Date.now()-runTime.getTime();
      const overdue=feedAgeMs>48*60*60*1000;
      const future=feedAgeMs<-(15*60*1000);
      const freshness=$("feedFreshness");
      freshness.hidden=!overdue&&!future;
      freshness.textContent=overdue?
        "Listings feed is over 48 hours old. Open the original employer posting to confirm each job is still available.":
        future?"The published feed timestamp is ahead of the current time. Check employer postings before applying.":"";
      if (scan.status === "failed") {
        showFeedStatus("failed", "Listing update unavailable", summary + ". Previously saved jobs remain available.");
        return;
      }
      if (state.mode === "imported" && !requestedByUser) {
        showFeedStatus(overdue||future?"partial":scan.status, "Published listings available", "Your imported listings are currently displayed. Select Reload listings to use the published feed. " + summary);
        return;
      }
      const oldMode = state.mode;
      const previous = state.jobs.filter(function (j) { return !j.demo; });
      const oldByKey = new Map(previous.map(function (j) { return [feedKey(j),j]; }));
      const seen = new Set();
      const cloud = [];
      feed.jobs.slice(0,500).forEach(function (raw) {
        const job = normalise(raw);
        if (!job || !safeUrl(job.url)) return;
        const key = feedKey(job);
        if (seen.has(key)) return;
        seen.add(key);
        const existing = oldByKey.get(key);
        job.id = existing ? existing.id : (str(raw.id) || newId());
        job.stage = existing ? existing.stage : "";
        job.source = "cloud";
        job.manual = false;
        const date = str(raw.posted_at || raw.addedAt);
        job.addedAt = /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0,10) : "";
        cloud.push(job);
      });
      // Retain manually added and tracked jobs even if a later scan misses them.
      const savedLocal = previous.filter(function (j) {
        return (j.manual || !!j.stage || (oldMode === "manual" && j.source !== "cloud")) && !seen.has(feedKey(j));
      });
      const isNewScan = state.feedGeneratedAt !== feed.generated_at;
      // Untracked public jobs yield capacity first. Never silently discard
      // saved applications because a fresh public scan fills the 500-job cap.
      const pinned=cloud.filter(function(j){return !!j.stage;}).concat(savedLocal);
      state.jobs=cloud.filter(function(j){return !j.stage;})
        .slice(0,Math.max(0,500-pinned.length)).concat(pinned).slice(0,500);
      state.mode = "live";
      state.feedGeneratedAt = feed.generated_at;
      if (isNewScan) log("Employer listings updated", cloud.length + " job listings · " + numErrors + " source errors");
      save(); render();
      showFeedStatus(overdue||future?"partial":scan.status,
        cloud.length + (cloud.length === 1 ? " published vacancy" : " published vacancies") +
        (overdue?" · feed overdue":future?" · timestamp inconsistent":scan.status==="partial"?" · some sources unavailable":""),
        summary+(overdue?" · The feed is overdue.":future?" · Feed time needs checking.":""));
      if (requestedByUser) toast(overdue||future?"Listings loaded; verify freshness at employer sites":"Published job listings are up to date");
    } catch (error) {
      showFeedStatus("failed", "Unable to refresh listings", "The published employer feed could not be loaded (" + String(error.message).slice(0,100) + "). Your saved jobs are unchanged.");
      if (requestedByUser) toast("The job listings service is temporarily unavailable");
    } finally {
      $("refreshCloud").disabled = false;
    }
  };
  $("refreshCloud").addEventListener("click", function () { syncCloudFeed(true); });

  // Private sync integration: UI-generated statuses are local until signed in.
  // Never allow fake/demo jobs to be uploaded to the private account.
  const privateJobKey = function(j) {
    const url=safeUrl(j.url);
    if(url)return url.slice(0,1500);
    return ("manual:"+[j.company,j.title,j.location].map(x=>str(x).toLowerCase().trim()).join("|")).slice(0,1500);
  };
  const trackable = function(j) {
    return {job_key:privateJobKey(j),title:j.title,company:j.company,
      location:j.location,job_url:j.url,stage:j.stage};
  };
  function oldDeviceJobs(){
    // Data stored by earlier Career-Ops versions is unassigned to any account.
    // Only show/import it after the user's explicit migration confirmation.
    const old=load(LEGACY_STORAGE_KEY,localStorage);
    const guest=load(GUEST_STORAGE_KEY,sessionStorage);
    const duplicates=new Map();
    for(const j of old.jobs.concat(guest.jobs)){
      if(!j.demo && j.stage)duplicates.set(privateJobKey(j),trackable(j));
    }
    return [...duplicates.values()].slice(0,300);
  }
  function forgetOldDeviceJobs(){
    try{localStorage.removeItem(LEGACY_STORAGE_KEY);}catch(_){}
    try{sessionStorage.removeItem(GUEST_STORAGE_KEY);}catch(_){}
  }
  window.CareerOpsDashboard=Object.freeze({
    getLegacyTrackedJobs:oldDeviceJobs,
    clearLegacyTrackedJobs:forgetOldDeviceJobs,
    getTrackedJobs:function(){
      return state.jobs.filter(j=>!j.demo && !!j.stage).map(trackable);
    },
    mergeRemoteTracking:function(rows){
      if(!Array.isArray(rows))return 0;
      let merged=0;
      for(const raw of rows.slice(0,500)){
        if(!raw || !STAGES.some(s=>s.name===raw.stage))continue;
        const title=str(raw.title).slice(0,160),company=str(raw.company).slice(0,130);
        const key=str(raw.job_key).slice(0,1500);
        if(!title || !company || key.length<6)continue;
        const url=safeUrl(raw.job_url);
        const existing=state.jobs.find(j=>!j.demo && privateJobKey(j)===key);
        if(existing){existing.stage=raw.stage;merged++;continue;}
        if(state.jobs.length>=500){
          const idx=state.jobs.findIndex(j=>!j.stage && !j.manual);
          if(idx<0)break;
          state.jobs.splice(idx,1);
        }
        state.jobs.push({
          id:newId(),title,company,location:str(raw.location).slice(0,160)||"Not specified",
          url,stage:raw.stage,skills:[],description:"",demo:false,manual:true,
          source:"cloud-tracking",addedAt:str(raw.updated_at)||stamp()
        });
        merged++;
      }
      if(merged){
        if(state.mode==="demo"){
          // Restored real private jobs should not be mixed with fictional samples.
          state.jobs=state.jobs.filter(j=>!j.demo);
          state.mode="manual";
        }
        save();render();
      }
      return merged;
    }
  });

  // Job status and application history are session-scoped to the CURRENT
  // account; this prevents old browser data from appearing for another user.
  const updateSettingsAccount=function(email){
    const indicator=$("settingsAccountStatus");
    if(!indicator)return;
    const address=str(email).slice(0,254);
    indicator.textContent=address?"Signed in as "+address:
      "Sign in with Google to access your private workspace.";
    indicator.dataset.state=address?"connected":"signed-out";
  };
  window.addEventListener("careerops:authenticated",function(event){
    const id=str(event.detail?.id);
    if(!/^[0-9a-fA-F-]{36}$/.test(id))return;
    updateSettingsAccount(event.detail?.email||"");
    if(activeAccountId===id)return;
    activeAccountId=id;
    accountEpoch++;
    state=load(ACCOUNT_STORAGE_PREFIX+id);
    activeJobId=null;
    if($("jobDialog")?.open)$("jobDialog").close();
    render();
    syncCloudFeed(false);
  });
  window.addEventListener("careerops:signed-out",function(){
    updateSettingsAccount("");
    activeAccountId=null;
    accountEpoch++;
    state=load(GUEST_STORAGE_KEY);
    activeJobId=null;
    if($("jobDialog")?.open)$("jobDialog").close();
    render();
    syncCloudFeed(false);
  });
  if (memoryOnly) toast("Local storage unavailable; changes may not persist.");
  render();
  // Preserve the OAuth fragment. Replace only invalid/empty initial routes.
  const initiallyValid=Object.prototype.hasOwnProperty.call(pageNames,String(location.hash||"").slice(1));
  showPage(pageFromLocation(),{
    history:authFragment()||initiallyValid?"none":"replace",
    scroll:false
  });
  syncCloudFeed(false);
})();