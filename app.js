/* Career-Ops browser-only dashboard. No backend, scanning, AI scoring, or automatic submissions. */
(function () {
  "use strict";
  const STORAGE_KEY = "career-ops-workspace-v1";
  const STAGES = [
    { name: "Saved", color: "#42dfb6" },
    { name: "Review", color: "#8cd9ff" },
    { name: "Applied", color: "#b4a7ff" },
    { name: "Interview", color: "#f5c782" },
    { name: "Offer", color: "#72e5a2" },
    { name: "Rejected", color: "#db8994" }
  ];
  const SAMPLE = [
    { id: "demo-1", title: "DevOps Engineer", company: "Northstar Systems", location: "Hyderabad, India", skills: ["AWS","Jenkins","Docker"], description: "Illustrative opportunity: manage CI/CD pipelines, cloud environments and automated deployments.", url: "", demo: true, stage: "", addedAt: "2026-11-20" },
    { id: "demo-2", title: "Cloud Engineer", company: "OrbitStack Labs", location: "Remote · India", skills: ["AWS","Terraform","Linux"], description: "Illustrative opportunity: build infrastructure automation and support resilient cloud platforms.", url: "", demo: true, stage: "", addedAt: "2026-11-19" },
    { id: "demo-3", title: "Site Reliability Engineer", company: "Beacon Cloud", location: "Bengaluru, India", skills: ["Kubernetes","Monitoring","Python"], description: "Illustrative opportunity: strengthen observability, reliability engineering and incident response.", url: "", demo: true, stage: "", addedAt: "2026-11-18" },
    { id: "demo-4", title: "Platform Engineer", company: "Mosaic Software", location: "Pune, India", skills: ["OpenShift","Docker","GitHub"], description: "Illustrative opportunity: maintain internal developer platforms and delivery tooling.", url: "", demo: true, stage: "", addedAt: "2026-11-17" },
    { id: "demo-5", title: "AWS DevOps Engineer", company: "Aster Digital", location: "Remote · India", skills: ["EC2","CloudWatch","Jenkins"], description: "Illustrative opportunity: administer AWS services and improve deployment workflows.", url: "", demo: true, stage: "", addedAt: "2026-11-16" },
    { id: "demo-6", title: "Release Engineer", company: "Pioneer Techworks", location: "Hyderabad, India", skills: ["CI/CD","Artifactory","Bash"], description: "Illustrative opportunity: coordinate releases and maintain build tooling across environments.", url: "", demo: true, stage: "", addedAt: "2026-11-15" }
  ];
  const DEFAULT_PREFS = {
    roles: "DevOps Engineer, Cloud Engineer, Site Reliability Engineer, Platform Engineer",
    locations: "Hyderabad, Bengaluru, Remote India",
    experience: "2–4 years",
    skills: "AWS, Jenkins, OpenShift, Docker, Kubernetes, Terraform, JFrog, Dynatrace"
  };
  const $ = function (id) { return document.getElementById(id); };
  const copy = function (x) { return JSON.parse(JSON.stringify(x)); };
  const escapeHtml = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  const safeUrl = function (v) { try { const u = new URL(String(v)); return (u.protocol === "http:" || u.protocol === "https:") ? u.href : ""; } catch (_) { return ""; } };
  const str = function (v) { return (typeof v === "string" || typeof v === "number") ? String(v).trim() : ""; };
  const newId = function () { return "job-" + Date.now() + "-" + Math.random().toString(36).slice(2,9); };
  let memoryOnly = false;
  const defaultState = function () { return { mode: "demo", jobs: copy(SAMPLE), prefs: copy(DEFAULT_PREFS), activity: [], importedAt: null, feedGeneratedAt: null }; };
  const load = function () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const x = JSON.parse(raw);
      if (!x || !Array.isArray(x.jobs)) return defaultState();
      return {
        mode: ["imported","manual","live"].includes(x.mode) ? x.mode : "demo",
        jobs: x.jobs.slice(0,500).map(function (j) {
          return { id: str(j.id) || newId(), title: str(j.title), company: str(j.company), location: str(j.location), skills: Array.isArray(j.skills) ? j.skills.slice(0,12).map(str) : [], description: str(j.description), url: safeUrl(j.url), demo: !!j.demo, manual: !!j.manual || (x.mode === "manual" && !j.demo), source: str(j.source), stage: STAGES.some(function (s) { return s.name === j.stage; }) ? j.stage : "", addedAt: str(j.addedAt) };
        }),
        prefs: Object.assign({}, DEFAULT_PREFS, x.prefs || {}),
        activity: Array.isArray(x.activity) ? x.activity.slice(0,100) : [],
        importedAt: str(x.importedAt) || null,
        feedGeneratedAt: str(x.feedGeneratedAt) || null
      };
    } catch (_) { memoryOnly = true; return defaultState(); }
  };
  let state = load();
  let activeJobId = null;
  const save = function () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { memoryOnly = true; }
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
  const pageNames = { overview:"Overview", discover:"Discover jobs", applications:"Applications", resume:"Resume lab", activity:"Activity", settings:"Settings & data" };
  const hideMobileMenu = function () {
    $("sidebar").classList.remove("open"); $("mobileScrim").classList.remove("show");
    $("mobileMenu").setAttribute("aria-expanded", "false");
  };
  const showPage = function (name) {
    if (!pageNames[name]) name = "overview";
    document.querySelectorAll(".page").forEach(function (el) { el.classList.toggle("active", el.id === "page-" + name); });
    document.querySelectorAll(".nav-link").forEach(function (el) {
      const current = el.getAttribute("data-nav") === name;
      el.classList.toggle("active", current);
      if (current) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    });
    $("currentCrumb").textContent = pageNames[name];
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    hideMobileMenu();
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const visibleJobs = function () {
    const search = $("jobSearch").value.trim().toLowerCase();
    const role = $("roleFilter").value.toLowerCase();
    const loc = $("locationFilter").value.toLowerCase();
    const sort = $("sortFilter").value;
    return state.jobs.filter(function (job) {
      const all = [job.title,job.company,job.location,job.description].concat(job.skills).join(" ").toLowerCase();
      return (!search || all.includes(search)) && (!role || job.title.toLowerCase().includes(role)) && (!loc || job.location.toLowerCase().includes(loc));
    }).sort(function (a,b) {
      if (sort === "company") return a.company.localeCompare(b.company);
      if (sort === "role") return a.title.localeCompare(b.title);
      return String(b.addedAt).localeCompare(String(a.addedAt));
    });
  };
  const companyInitials = function (company) {
    const bits = String(company).split(/\s+/).filter(Boolean);
    return (bits.length >= 2 ? bits[0][0] + bits[1][0] : String(company).slice(0,2)).toUpperCase();
  };
  const jobSource = function (j) { return j.demo ? "Illustrative job" : j.source === "cloud" ? "Public scanner result" : (j.url ? "Job URL attached" : "No source URL"); };
  const chips = function (skills) { return (skills || []).slice(0,5).map(function (s) { return '<span class="skill-chip">' + escapeHtml(s) + '</span>'; }).join(""); };
  const find = function (id) { return state.jobs.find(function (j) { return j.id === id; }); };
  const overviewRow = function (j) {
    return '<div class="overview-row"><div class="company-symbol">' + escapeHtml(companyInitials(j.company)) + '</div><div class="overview-row-copy"><strong>' + escapeHtml(j.title) + '</strong><p>' + escapeHtml(j.company) + ' · ' + escapeHtml(j.location) + '</p></div><span class="match unscored">Not scored</span><button class="overview-open" data-action="details" data-id="' + escapeHtml(j.id) + '" aria-label="Details for ' + escapeHtml(j.title) + '">↗</button></div>';
  };
  const card = function (j) {
    const url = safeUrl(j.url);
    const details = '<button class="text-link secondary-link" type="button" data-action="details" data-id="' + escapeHtml(j.id) + '">Details</button>';
    const open = url
      ? '<a class="text-link open-job-link" href="' + escapeHtml(url) + '" rel="noopener noreferrer" aria-label="Open job listing for ' + escapeHtml(j.title) + ' at ' + escapeHtml(j.company) + '">Open listing ↗</a>'
      : '<span class="no-url-label">' + (j.demo ? 'Sample job — no link' : 'Posting link unavailable') + '</span>';
    return '<article class="job-card"><div class="job-card-top"><div class="company-symbol">' + escapeHtml(companyInitials(j.company)) + '</div><button class="save-button ' + (j.stage ? 'saved' : '') + '" data-action="save" data-id="' + escapeHtml(j.id) + '">' + (j.stage ? '✓ Tracking' : '+ Save') + '</button></div><h3>' + escapeHtml(j.title) + '</h3><p class="company-line">' + escapeHtml(j.company) + ' · ' + escapeHtml(j.location) + '</p><p class="description">' + escapeHtml(j.description || 'No job description added yet.') + '</p><div class="chip-wrap">' + chips(j.skills) + '</div><div class="card-footer"><span class="job-date">' + escapeHtml(jobSource(j)) + '</span><div class="card-action-group">' + details + open + '</div></div></article>';
  };
  const pipelineCount = function (stage) { return state.jobs.filter(function (j) { return j.stage === stage; }).length; };
  const renderOverview = function () {
    $("statDiscovered").textContent = state.jobs.length;
    $("statSaved").textContent = pipelineCount("Saved") + pipelineCount("Review");
    $("statApplied").textContent = ["Applied","Interview","Offer","Rejected"].reduce(function (n,s) { return n + pipelineCount(s); },0);
    $("statInterviews").textContent = pipelineCount("Interview");
    $("navJobsCount").textContent = state.jobs.length;
    const top = state.jobs.slice(0,4);
    $("overviewJobs").innerHTML = top.length ? top.map(overviewRow).join("") : '<p class="muted">No opportunities yet. Add a job or import scan results.</p>';
    const total = STAGES.reduce(function (n,s) { return n + pipelineCount(s.name); },0);
    $("pipelineChart").innerHTML = STAGES.map(function (s) { const n = pipelineCount(s.name); return n ? '<span class="pipeline-bar" style="background:' + s.color + ';flex:' + n + '"></span>' : ''; }).join("");
    $("pipelineLegend").innerHTML = STAGES.map(function (s) { return '<div class="legend-item"><span><i style="background:' + s.color + '"></i>' + s.name + '</span><b>' + pipelineCount(s.name) + '</b></div>'; }).join("");
    if (!total) $("pipelineChart").title = "No tracked opportunities yet";
    const notice = document.querySelector("#page-overview .notice");
    if (state.mode === "demo") {
      notice.querySelector("div").innerHTML = '<strong>Demo workspace</strong> — sample listings are illustrative, not live job postings. Import scanner JSON or add a real opportunity to start tracking locally.';
    } else if (state.mode === "live") {
      notice.querySelector("div").innerHTML = '<strong>Cloud scanner connected</strong> — job cards come from public career portals, not verified application availability. AI scoring, resume tailoring and automatic submissions are not enabled.';
    } else {
      notice.querySelector("div").innerHTML = '<strong>Local tracking mode</strong> — imported and manually added jobs are not verified live. No AI matching or application submission is connected.';
    }
  };
  const renderDiscover = function () {
    const jobs = visibleJobs();
    $("jobsGrid").innerHTML = jobs.map(card).join("");
    $("resultsCount").textContent = jobs.length + (jobs.length === 1 ? " opportunity" : " opportunities");
    $("emptyJobs").hidden = jobs.length !== 0;
    $("dataModeTag").textContent = state.mode === "demo" ? "Sample listings" : state.mode === "live" ? "Cloud scanner" : "Local records";
    $("dataModeTag").classList.toggle("real", state.mode !== "demo");
  };
  const renderBoard = function () {
    $("applicationsBoard").innerHTML = STAGES.map(function (s) {
      const jobs = state.jobs.filter(function (j) { return j.stage === s.name; });
      return '<section class="board-column"><div class="board-heading"><i style="background:' + s.color + '"></i><strong>' + s.name + '</strong><b>' + jobs.length + '</b></div>' + (jobs.length ? jobs.map(function (j) {
        return '<article class="board-card"><strong>' + escapeHtml(j.title) + '</strong><p>' + escapeHtml(j.company) + '</p><label><span class="muted small">Move to</span><select data-stage-id="' + escapeHtml(j.id) + '" aria-label="Change status for ' + escapeHtml(j.title) + '">' + ['Not tracking'].concat(STAGES.map(function (x) { return x.name; })).map(function (name) { const val = name === "Not tracking" ? "" : name; return '<option value="' + escapeHtml(val) + '"' + (val === j.stage ? ' selected' : '') + '>' + escapeHtml(name) + '</option>'; }).join("") + '</select></label></article>';
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
    $("targetRoles").value = str(state.prefs.roles);
    $("targetLocations").value = str(state.prefs.locations);
    $("targetExperience").value = str(state.prefs.experience);
    $("targetSkills").value = str(state.prefs.skills);
  };
  const render = function () { renderOverview(); renderDiscover(); renderBoard(); renderActivity(); renderPreferences(); };
  const track = function (id) {
    const job = find(id); if (!job) return;
    if (job.stage && job.stage !== "Saved") { toast("Already tracked as " + job.stage + ". Change it in Applications."); return; }
    job.stage = job.stage === "Saved" ? "" : "Saved";
    log(job.stage ? "Job saved" : "Job removed from shortlist", job.title + " · " + job.company);
    save(); render(); toast(job.stage ? "Job added to your pipeline" : "Job removed from shortlist");
  };
  const openDetails = function (id) {
    const j = find(id); if (!j) return; activeJobId = id;
    $("dialogEyebrow").textContent = j.demo ? "ILLUSTRATIVE OPPORTUNITY" : "YOUR OPPORTUNITY";
    $("dialogTitle").textContent = j.title;
    $("dialogMeta").textContent = j.company + " · " + j.location;
    $("dialogDescription").textContent = j.description || "No description provided. Review the original job listing for full requirements.";
    $("dialogSkills").innerHTML = chips(j.skills);
    const url = safeUrl(j.url);
    $("dialogSource").textContent = url ? jobSource(j) + " · opens on the employer website"
      : (j.demo ? "Sample job: this is not a real listing, so there is no external URL."
      : "This job record has no valid posting URL. Open the employer's career site to locate it.");
    $("dialogSave").textContent = j.stage ? "✓ Tracking" : "+ Save job";
    $("dialogLink").hidden = !url;
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
    save(); render(); toast("Status updated locally");
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
      skills: skills.map(str).filter(Boolean).slice(0,12),
      description: str(j.description || j.summary || j.job_description || "").slice(0,3000),
      url: safeUrl(j.apply_url || j.job_url || j.url || j.link || j.source_url),
      demo: false, manual: false, source: "import", stage: "", addedAt: stamp()
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
      state.jobs = jobs.concat(previousTrackedJobs).slice(0,500);
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
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches("[data-stage-id]")) setStage(e.target.getAttribute("data-stage-id"), e.target.value);
  });
  ["jobSearch","roleFilter","locationFilter","sortFilter"].forEach(function (id) { $(id).addEventListener(id === "jobSearch" ? "input" : "change", renderDiscover); });
  $("clearFilters").addEventListener("click", function () { $("jobSearch").value = ""; $("roleFilter").value = ""; $("locationFilter").value = ""; renderDiscover(); });
  $("mobileMenu").addEventListener("click", function () { const open = $("sidebar").classList.toggle("open"); $("mobileScrim").classList.toggle("show",open); $("mobileMenu").setAttribute("aria-expanded", String(open)); });
  $("mobileScrim").addEventListener("click", hideMobileMenu);
  window.addEventListener("hashchange", function () { showPage(location.hash.replace("#","")); });
  $("openAddJob").addEventListener("click", function () { $("addDialog").showModal(); });
  $("closeDialog").addEventListener("click", function () { $("jobDialog").close(); });
  $("closeAddDialog").addEventListener("click", function () { $("addDialog").close(); });
  $("dialogSave").addEventListener("click", function () { if (activeJobId) { track(activeJobId); const j = find(activeJobId); $("dialogSave").textContent = j && j.stage ? "✓ Tracking" : "+ Save job"; } });
  $("addJobForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = str(form.get("title")), company = str(form.get("company"));
    if (!title || !company) return;
    const rawUrl = str(form.get("url"));
    const url = safeUrl(rawUrl);
    if (rawUrl && !url) { toast("Please enter a valid http(s) job URL"); return; }
    const job = { id:newId(),title:title.slice(0,160),company:company.slice(0,120),location:str(form.get("location")) || "Not specified",skills:str(form.get("skills")).split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0,12),description:str(form.get("description")),url:url,demo:false,manual:true,source:"manual",stage:"Saved",addedAt:stamp() };
    if (state.mode === "demo") state.jobs = state.jobs.filter(function (j) { return !j.demo; });
    state.jobs.unshift(job); if (state.mode !== "live") state.mode = "manual";
    log("Opportunity added", title + " · " + company);
    save(); render(); $("addJobForm").reset(); $("addDialog").close(); toast("Opportunity added to your pipeline");
  });
  $("preferencesForm").addEventListener("submit", function (e) {
    e.preventDefault();
    state.prefs = { roles:$("targetRoles").value.trim(),locations:$("targetLocations").value.trim(),experience:$("targetExperience").value.trim(),skills:$("targetSkills").value.trim() };
    log("Preferences updated","Target role and skill preferences were saved locally");
    save(); renderActivity(); toast("Preferences saved locally");
  });
  $("resumeFile").addEventListener("change", function (e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/\.(pdf|docx)$/i.test(f.name)) { toast("Please select a PDF or DOCX resume"); e.target.value = ""; return; }
    if (f.size > 15*1024*1024) { toast("File exceeds 15 MB"); e.target.value = ""; return; }
    $("resumeFileLabel").textContent = f.name + " · selected locally only";
    toast("Resume selected. Analysis is not connected yet.");
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
    state = defaultState(); save(); $("importMessage").textContent = "No scanner connected. Import a file to replace sample jobs."; $("resumeFileLabel").textContent = "No file selected"; render(); showPage("overview"); toast("Demo workspace restored");
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
    $("feedTitle").textContent = title;
    $("feedText").textContent = description;
  };
  const syncCloudFeed = async function (requestedByUser) {
    $("refreshCloud").disabled = true;
    showFeedStatus("loading", "Checking cloud scanner...", "Reading the latest published public-job feed");
    try {
      const response = await fetch("./data/jobs.json?v=" + Date.now(), {cache:"no-store"});
      if (!response.ok) throw new Error("HTTP " + response.status);
      const feed = await response.json();
      if (!feed || feed.schema !== "careerops.public-jobs.v1" || !Array.isArray(feed.jobs)
        || !feed.scan || !["success","partial","failed"].includes(feed.scan.status)) {
        throw new Error("Unsupported scanner feed format");
      }
      const runTime = new Date(feed.generated_at);
      if (!Number.isFinite(runTime.valueOf())) throw new Error("Scanner date is invalid");
      const lastRun = runTime.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
      const scan = feed.scan;
      const numErrors = Number(scan.error_count) || 0;
      const summary = "Last run: " + lastRun + " · " + (Number(scan.found) || 0) + " scanned postings · " + numErrors + " source errors";
      if (scan.status === "failed") {
        showFeedStatus("failed", "Cloud scan failed", summary + ". Existing browser records are preserved.");
        return;
      }
      if (state.mode === "imported" && !requestedByUser) {
        showFeedStatus(scan.status, "Cloud feed available · local import selected", "Click Refresh jobs to switch to the latest cloud feed. " + summary);
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
        job.addedAt = /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0,10) : feed.generated_at;
        cloud.push(job);
      });
      // Retain manually added and tracked jobs even if a later scan misses them.
      const savedLocal = previous.filter(function (j) {
        return (j.manual || !!j.stage || (oldMode === "manual" && j.source !== "cloud")) && !seen.has(feedKey(j));
      });
      const isNewScan = state.feedGeneratedAt !== feed.generated_at;
      state.jobs = cloud.concat(savedLocal).slice(0,500);
      state.mode = "live";
      state.feedGeneratedAt = feed.generated_at;
      if (isNewScan) log("Public scanner feed refreshed", cloud.length + " job listings · " + numErrors + " source errors");
      save(); render();
      showFeedStatus(scan.status, cloud.length + (cloud.length === 1 ? " public match" : " public matches") +
        (scan.status === "partial" ? " · partial scan" : " · scanner connected"), summary);
      if (requestedByUser) toast("Latest published scanner feed loaded");
    } catch (error) {
      showFeedStatus("failed", "Cloud feed not available", "The published jobs file could not be reached (" + String(error.message).slice(0,100) + "). Your saved jobs remain available.");
      if (requestedByUser) toast("The published scanner feed is not available yet");
    } finally {
      $("refreshCloud").disabled = false;
    }
  };
  $("refreshCloud").addEventListener("click", function () { syncCloudFeed(true); });

  if (memoryOnly) toast("Local storage unavailable; changes may not persist.");
  render();
  showPage(location.hash.replace("#","") || "overview");
  syncCloudFeed(false);
})();