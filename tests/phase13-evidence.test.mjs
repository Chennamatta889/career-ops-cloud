import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const m=require("../phase13-evidence.js");
test("does not invent verified skills from user profile",()=>{
 const x=m.assess({title:"DevOps Engineer",skills:["AWS","Jenkins"],requiredExperience:"3+ years",location:"Hyderabad"},{roles:["DevOps Engineer"],skills:["AWS","Jenkins"],resumeText:"Maintained Jenkins build pipelines for releases.",experienceYears:2,locations:["Hyderabad"]});
 assert.deepEqual(x.matchedSkills,["Jenkins"]);assert.deepEqual(x.missingOrUnverifiedSkills,["AWS"]);assert.equal(x.experience,"below-minimum");
});
test("unknown job requirements remain unknown rather than eligible",()=>{
 const x=m.assess({title:"Developer"},{resumeText:"A sample resume",experienceYears:3});
 assert.equal(x.experience,"unverified");assert.equal(x.score,null);assert.equal(x.confidence,"limited-evidence");
});
test("tailoring only extracts original resume lines",()=>{
 const line="Maintained Jenkins pipelines and investigated production deployment failures.";
 const x=m.draftSummary({title:"DevOps Engineer",skills:["Jenkins"]},{skills:["Jenkins"],resumeText:line+"\n"+line,experienceYears:3});
 assert.ok(x.draft.includes(line));assert.ok(!x.draft.includes("AWS"));
});
test("range requirements flag out-of-range experience",()=>{
 assert.equal(m.assess({requiredExperience:"2-4 years"},{experienceYears:5}).experience,"above-stated-range");
});
