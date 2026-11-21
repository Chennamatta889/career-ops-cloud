const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {plainText,decodeEntities,experienceRequirement,experienceMatches,entryOpportunity}=require("../job-text.js");
const repoFile=p=>fs.readFileSync(path.resolve(__dirname,"..",p),"utf8");

test("Cohere Health-style rich job descriptions become readable paragraphs and bullets",()=>{
  const slash=String.fromCharCode(92);
  const raw="<p><strong>Opportunity Overview</strong></p> <p>As a Senior Applied Scientist, you will play a key role in building and scaling Cohere Health’s AI capabilities.&nbsp;</p> <p>Our Applied Science team’s work is focused on:</p> <ul> <li>Complex clinical document understanding</li> <li>Evaluating models for clinical workflows</li> </ul>";
  const html=raw.replace(/</g,slash+"<");
  const result=plainText(html);
  assert.match(result,/^Opportunity Overview\n\nAs a Senior Applied Scientist/);
  assert.match(result,/Our Applied Science team’s work is focused on:/);
  assert.match(result,/• Complex clinical document understanding/);
  assert.match(result,/• Evaluating models for clinical workflows/);
  assert.doesNotMatch(result,/<\/?(?:p|ul|li|strong)\b|&nbsp;|\\/i);
});
test("encoded and twice-encoded employer HTML is decoded before formatting",()=>{
  const result=plainText("&amp;lt;p&amp;gt;Responsibilities&amp;lt;/p&amp;gt;&amp;lt;ul&amp;gt;&amp;lt;li&amp;gt;R&amp;amp;D &amp;mdash; patients&amp;lt;/li&amp;gt;&amp;lt;/ul&amp;gt;");
  assert.match(result,/Responsibilities/);
  assert.match(result,/• R&D — patients/);
  assert.doesNotMatch(result,/&amp;|&lt;|<p>/);
  assert.equal(decodeEntities("&#160; &#x1F4A1; &quot;"),'  💡 "');
});
test("unsafe markup cannot execute and is never passed as HTML for display",()=>{
  const payload='<script>alert("executed")</script><style>body{display:none}</style>'+
    '<p>Real job details</p><img src=x onerror="alert(2)">'+
    '<a href="javascript:alert(3)">Apply details</a>';
  const result=plainText(payload);
  assert.match(result,/Real job details/);
  assert.match(result,/Apply details/);
  assert.doesNotMatch(result,/alert|script|style|onerror|<img|href|javascript/);
  const app=repoFile("app.js");
  assert.match(app,/\$\("dialogDescription"\)\.textContent=fullDescription/);
  assert.match(app,/readableJobText\(j\.description,6000\)/);
  assert.doesNotMatch(app,/\$\("dialogDescription"\)\.innerHTML\s*=/);
});
test("ordinary text and mathematical comparisons remain readable",()=>{
  assert.equal(plainText("Patients with scores < 5 and A&B can apply."),"Patients with scores < 5 and A&B can apply.");
  assert.equal(plainText("<p>Pre-screening &amp; evaluation</p>"),"Pre-screening & evaluation");
  assert.equal(plainText("   "),"");
  assert.equal(plainText({html:"not a string"}),"");
});
test("large public job text is capped without breaking processing",()=>{
  const result=plainText("<p>"+"X".repeat(18000)+"</p>",1800);
  assert.equal(result.length,1800);
  assert.ok(!result.includes("<p>"));
});
test("no optional ranking prompt appears under employer descriptions",()=>{
  const app=repoFile("app.js");
  const html=repoFile("index.html");
  const styles=repoFile("styles.css");
  assert.doesNotMatch(app,/Personalized ranking is optional/);
  assert.match(app,/\$\("matchExplanation"\)\.hidden=!priorityConfigured/);
  assert.match(html,/id="dialogDescriptionNote"/);
  assert.match(styles,/\.priority-explanation\[hidden\]\{display:none!important\}/);
  assert.match(styles,/\.job-description-readable\{[\s\S]*white-space:pre-line/);
});
test("scheduled ATS feed shares safe text conversion and retains meaningful excerpts",()=>{
  const scanner=repoFile("scripts/universal-job-scan.mjs");
  const workflow=repoFile(".github/workflows/deploy-ui.yml");
  assert.match(scanner,/require\("\.\.\/job-text\.js"\)/);
  assert.match(scanner,/const desc=plainText\(/);
  assert.match(scanner,/2500\)/);
  assert.match(workflow,/cp index\.html styles\.css/);
});

test("explicit employer experience ranges and minimum years are extracted without inference",()=>{
  const samples=[
    ["<p>Qualifications: 3–5 years of relevant software engineering experience</p>","3–5 years",3],
    ["Requirements: At least 4 years of professional experience","4+ years",4],
    ["You have 2+ years of hands-on experience with cloud tools","2+ years",2],
    ["Required: 6 to 9 years of industry experience","6–9 years",6],
    ["We welcome freshers and offer training","No experience required",0],
    ["No prior experience required for this position","No experience required",0],
    ["1–2 years","1–2 years",1],
    ["10+ years","10+ years",10]
  ];
  for(const [description,label,min] of samples){
    const got=experienceRequirement(description);
    assert.equal(got?.label,label,description);
    assert.equal(got?.minYears,min,description);
  }
});
test("unknown experience requirements stay unknown and are not inferred from titles or company history",()=>{
  for(const description of [
    "Senior DevOps Engineer. Familiarity with Kubernetes is desirable.",
    "Our company has been in business for 20 years and works worldwide.",
    "Great opportunity for an experienced developer.",
    "Entry level position, flexible requirements.",
    "Required: knowledge of JavaScript."
  ])assert.equal(experienceRequirement(description),null,description);
});
test("experience levels filter explicit minimums and isolate unspecified requirements",()=>{
  assert.equal(experienceMatches("3–5 years","3-5"),true);
  assert.equal(experienceMatches("3–5 years","1-2"),false);
  assert.equal(experienceMatches("4+ years","3-5"),true);
  assert.equal(experienceMatches("10+ years","10+"),true);
  assert.equal(experienceMatches("No experience required","fresher"),true);
  assert.equal(experienceMatches("","unspecified"),true);
  assert.equal(experienceMatches("","3-5"),false);
  assert.equal(experienceMatches("", ""),true);
});

test("fresher filter recognizes internships, apprenticeships and campus graduate roles without inventing zero-years",()=>{
  const sample=[
    [{title:"Graduate Engineer Trainee"}, "fresher","title"],
    [{title:"HR Intern"}, "fresher","title"],
    [{title:"Software Engineering Internship"}, "fresher","title"],
    [{title:"Apprentice - Finance"}, "fresher","title"],
    [{title:"New Graduate Developer"}, "fresher","title"],
    [{title:"Campus Graduate Program"}, "fresher","title"],
    [{title:"Junior Accountant"}, "early","title"],
    [{title:"Software Engineer I"}, "early","title"],
    [{title:"Cloud Engineer",requiredExperience:"1–2 years"}, "early","explicit"],
    [{title:"Customer Support",requiredExperience:"No experience required"}, "fresher","explicit"],
    [{title:"Sales Associate",requiredExperience:"3+ years"}, "unknown",""],
    [{title:"Senior Associate Engineer",requiredExperience:"1–2 years"}, "unknown",""],
    [{title:"Lead Intern",requiredExperience:"No experience required"}, "unknown",""],
    [{title:"AI Researcher Intern",requiredExperience:"2–3 years"}, "early","explicit"],
    [{title:"Software Engineer",description:"Working with Linux."},"unknown",""],
    [{title:"Recruitment Intern",requiredExperience:"5 years"}, "unknown",""],
    [{title:"VP Design & Brand",requiredExperience:"0+ years"}, "unknown",""],
    [{title:"TL Sourcing AGM Channel Sales",requiredExperience:"0+ years"}, "unknown",""],
    [{title:"Supervisor - Managed Services",requiredExperience:"1–2 years"}, "unknown",""],
    [{title:"Team Leader - Customer Experience",requiredExperience:"0+ years"}, "unknown",""],
    [{title:"Management Trainee",requiredExperience:"No experience required"}, "fresher","explicit"]
  ];
  for(const [job,expected,basis] of sample){
    const signal=entryOpportunity(job);
    assert.equal(signal.level,expected,job.title);
    assert.equal(signal.basis,basis,job.title);
    assert.equal(job.requiredExperience||"",job.requiredExperience||"");
  }
});
test("entry-level UI is opt-in, and published job metadata labels cannot override explicit senior experience",()=>{
  const ui=repoFile("app.js"),html=repoFile("index.html");
  assert.match(html,/id="showFresherJobs"/);
  assert.match(html,/value="fresher">Freshers, interns/);
  assert.match(html,/value="entry">Early career/);
  assert.match(ui,/window\.CareerOpsJobText\?\.entryOpportunity\?\.\(job\)/);
  assert.match(ui,/\$\("showFresherJobs"\)\.addEventListener/);
  assert.match(ui,/Fresher \/ intern pathway/);
  assert.equal(entryOpportunity({title:"Graduate Trainee",entry_level:"fresher",requiredExperience:"10+ years"}).level,"unknown");
});
