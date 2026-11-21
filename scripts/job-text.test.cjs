const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {plainText,decodeEntities}=require("../job-text.js");
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
