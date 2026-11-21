const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {analyse,scoreJob}=require("../application-email.js");
test("explicit confirmation language is evidence for human review, not automatic application",()=>{
  const e=analyse({subject:"Application Received - Cloud Engineer",sender:"recruiting@acme.example",
    body:"We have received your application for Cloud Engineer at Acme."});
  assert.equal(e.isLikelyAcknowledgement,true);
  assert.equal(e.senderPresent,true);
  assert.equal(e.status,"possible-acknowledgement");
  assert.equal(scoreJob(e,{title:"Cloud Engineer",company:"Acme"}),100);
  assert.equal(scoreJob(e,{title:"Sales Associate",company:"Other Employer"}),0);
});
test("job alerts, rejections, generic recruiter messages and invitations do not claim successful submission",()=>{
  for(const body of [
    "Job alert! Please apply to our DevOps Engineer openings.",
    "Unfortunately your application was rejected.",
    "We'd like to invite you to apply for an open role.",
    "Thank you for your interest, follow our careers website.",
    "Your application status has changed. See details.",
    "Subscribe to job recommendations.",
    "Your application was unsuccessful."
  ])assert.equal(analyse({subject:"Jobs update",sender:"jobs@acme.example",body}).isLikelyAcknowledgement,false,body);
});
test("pasted mail is not cryptographically or provider-verified",()=>{
  const a=analyse({sender:"",subject:"Your application has been received",body:"At Acme, thanks!"});
  assert.equal(a.isLikelyAcknowledgement,true);
  assert.equal(a.status,"unverified-sender");
  assert.match(a.notice,/not been independently verified/);
});
test("source contains no Gmail OAuth requests, persistence or auto-apply handlers",()=>{
  const src=fs.readFileSync(path.resolve(__dirname,"../application-email.js"),"utf8");
  assert.doesNotMatch(src,/\b(?:fetch|GmailApp|localStorage|sessionStorage|sendMail|submitApplication)\s*\(/);
  assert.doesNotMatch(src,/gmail\.readonly|oauth2\.googleapis\.com/);
});
