/* Career-Ops explainable local prioritization. NOT AI, ATS, or resume analysis. */
(function (root) {
  "use strict";
  function text(x) { return typeof x === "string" ? x : ""; }
  function clean(x) {
    return text(x).toLowerCase().replace(/[–—‑]/g,"-").replace(/[^a-z0-9+#./-]+/g," ").replace(/\s+/g," ").trim();
  }
  function split(raw) {
    return text(raw).split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0,30);
  }
  var GROUPS = {
    devops: ["devops", "dev ops"],
    sre: ["site reliability", "sre"],
    cloud: ["cloud engineer", "cloud infrastructure", "cloud operations", "aws engineer", "azure engineer"],
    platform: ["platform engineer", "platform engineering", "developer platform"],
    infra: ["infrastructure engineer", "infrastructure automation"],
    release: ["release engineer", "build engineer", "release management", "build and release"]
  };
  function groups(value) {
    var s = " " + clean(value) + " ";
    return Object.keys(GROUPS).filter(function (key) {
      return GROUPS[key].some(function (term) { return s.includes(" " + term + " "); });
    });
  }
  function wordHit(haystack, needle) {
    var h = " " + clean(haystack) + " ";
    var n = clean(needle);
    if (!n || n.length < 2) return false;
    var i = h.indexOf(" " + n);
    while (i >= 0) {
      var following = h[i + n.length + 1] || " ";
      if (!/[a-z0-9]/.test(following)) return true;
      i = h.indexOf(" " + n, i + 1);
    }
    return false;
  }
  function roleFit(title, targetRoles) {
    var roleList = split(targetRoles);
    if (!roleList.length) return { points: 0, detail: "No target roles configured", known: false };
    var titleGroups = groups(title);
    var targetGroups = roleList.flatMap(groups);
    var exact = roleList.some(function (role) { return wordHit(title,role) || wordHit(role,title); });
    if (exact || titleGroups.some(function (g) { return targetGroups.includes(g); })) {
      return { points: 50, detail: "Job title aligns with your target role", known: true };
    }
    var related = titleGroups.some(function (g) {
      return (g === "infra" || g === "release") && (targetGroups.includes("devops") || targetGroups.includes("platform") || targetGroups.includes("cloud"));
    });
    if (related) return { points: 22, detail: "Related engineering role (check responsibilities)", known: true };
    return { points: 0, detail: "Title differs from your selected roles", known: true };
  }
  function locationFit(location, preferredLocations) {
    var loc = clean(location);
    var prefs = split(preferredLocations);
    if (!loc || loc === "not specified" || loc === "location not specified") {
      return { points: 0, detail: "Location not stated", known: false };
    }
    if (!prefs.length) return { points: 0, detail: "No location preferences configured", known: false };
    var match = prefs.some(function (place) {
      var p = clean(place);
      if (p.includes("remote")) return loc.includes("remote") && (!p.includes("india") || loc.includes("india"));
      if (p.includes("hyderabad") && loc.includes("hyderabad")) return true;
      if ((p.includes("bengaluru") || p.includes("bangalore")) && (loc.includes("bengaluru") || loc.includes("bangalore"))) return true;
      return wordHit(loc,p);
    });
    if (match) return { points: 30, detail: "Location matches a selected preference", known: true };
    return { points: 0, detail: "Location is outside your stated preferences", known: true };
  }
  function skillFit(job, configuredSkills) {
    var sought = split(configuredSkills);
    if (!sought.length) return { points: 0, detail: "No preferred skills configured", known: false, found: [] };
    var tags = Array.isArray(job.skills) ? job.skills.filter(function (s) { return typeof s === "string"; }) : [];
    var body = [text(job.title), text(job.description)].concat(tags).join(" ");
    var found = sought.filter(function (s) { return wordHit(body,s); });
    if (found.length > 0) {
      return { points: found.length >= 3 ? 20 : found.length === 2 ? 16 : 10,
        detail: "Mentioned: " + found.slice(0,4).join(", "), known: true, found:found };
    }
    if (!text(job.description).trim() && tags.length === 0) {
      return { points: 0, detail: "Skills not available in scanner's job summary", known: false, found: [] };
    }
    return { points: 0, detail: "No configured skills found in available job text", known: true, found: [] };
  }
  function yearsNote(job, exp) {
    var label = text(job.requiredExperience).trim();
    if (!label) return "Experience requirement not captured";
    var targetYears = (text(exp).match(/\d+/g) || []).map(Number);
    var requiredYears = (label.match(/\d+/g) || []).map(Number);
    if (targetYears.length && requiredYears.length && requiredYears[0] > Math.max.apply(null,targetYears)) {
      return label + " · stated requirement may exceed your selected range";
    }
    return label + " · check the full posting";
  }
  function rank(job, prefs) {
    var p = prefs || {};
    var role = roleFit(job.title, p.roles);
    var location = locationFit(job.location, p.locations);
    var skill = skillFit(job, p.skills);
    var score = role.points + location.points + skill.points;
    var knownCount = [role,location,skill].filter(function (x) { return x.known; }).length;
    return {
      score: Math.max(0,Math.min(100,score)),
      quality: knownCount === 3 ? "More evidence" : "Limited evidence",
      knownSignals: knownCount,
      role: role,
      location: location,
      skills: skill,
      experience: yearsNote(job,p.experience),
      method: "Rule-based priority (title 50 + location 30 + skills 20). Not AI or resume screening."
    };
  }
  var api = { rank:rank, groups:groups, wordHit:wordHit };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CareerOpsMatch = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
