const test = require("node:test");
const assert = require("node:assert/strict");
const match = require("../match-engine.js");
const p = {
  roles: "DevOps Engineer, Cloud Engineer, Site Reliability Engineer, Platform Engineer",
  locations: "Hyderabad, Bengaluru, Remote India",
  skills: "AWS, Jenkins, Docker, Terraform",
  experience: "2-4 years"
};
test("matches relevant jobs and explains title/location/skills", () => {
  const x = match.rank({title:"DevOps Engineer",location:"Hyderabad, India",skills:["AWS","Jenkins","Docker"]},p);
  assert.equal(x.score,100);
  assert.equal(x.role.points,50);
  assert.equal(x.location.points,30);
  assert.equal(x.skills.points,20);
  assert.equal(x.quality,"More evidence");
});
test("does not invent skill evidence when a scanner offers only title and location", () => {
  const x=match.rank({title:"Site Reliability Engineer",location:"Remote, India",skills:[],description:""},p);
  assert.equal(x.score,80);
  assert.equal(x.quality,"Limited evidence");
  assert.match(x.skills.detail,/not available/);
});
test("avoids false remote matches outside the requested country", () => {
  const x=match.rank({title:"Cloud Engineer",location:"Remote, United States",skills:[]},p);
  assert.equal(x.location.points,0);
});
test("labels above-range requirements without assuming eligibility", () => {
  const x=match.rank({title:"Platform Engineer",location:"Bengaluru",requiredExperience:"5+ years"},p);
  assert.match(x.experience,/may exceed/);
});
test("recognizes SRE as site reliability and does not mistake substring", () => {
  assert.ok(match.groups("SRE Engineer").includes("sre"));
  assert.equal(match.wordHit("Some AWSome opportunity","AWS"),false);
});
test("does not claim AI scoring or punish unknown location as a mismatch", () => {
  const x=match.rank({title:"DevOps Engineer",location:"Location not specified"},p);
  assert.equal(x.location.known,false);
  assert.match(x.method,/Not AI/);
});
