import test from "node:test";
import assert from "node:assert/strict";
import {judgeFeed} from "./guard-public-feed.mjs";
const feed=(count,errors=0,healthy=20,total=20)=>({
  schema:"careerops.public-jobs.v1",market:"IN",
  jobs:Array.from({length:count},(_,i)=>({id:i,location:"Bengaluru, India"})),
  scan:{status:errors?"partial":"success",india_only:true,error_count:errors},
  source_health:Array.from({length:total},(_,i)=>({status:i<healthy?"ok":"error"}))
});
test("Phase 10 protects visitors from empty public job feeds",()=>{
  assert.equal(judgeFeed(feed(0),feed(750)).ok,false);
  assert.equal(judgeFeed(feed(500),feed(750)).ok,true);
});
test("Phase 10 blocks mass outages but allows normal employer churn",()=>{
  assert.equal(judgeFeed(feed(50,10,4,20),feed(650)).ok,false);
  assert.equal(judgeFeed(feed(90,3,18,20),feed(1000)).ok,false);
  assert.equal(judgeFeed(feed(900,1,18,20),feed(1000)).ok,true);
  assert.equal(judgeFeed(feed(90,0,20,20),feed(1000)).ok,true);
});
test("Phase 10 does not assume previous feeds can always be reached",()=>{
  assert.equal(judgeFeed(feed(300,2,18,20),null).ok,true);
  assert.equal(judgeFeed({schema:"other",jobs:[]},null).ok,false);
});

test("India-only release guard prevents accidental overseas publication or global scope regression",()=>{
  const current=feed(10);
  assert.equal(judgeFeed({...current,market:"WORLD"},null).ok,false);
  assert.equal(judgeFeed({...current,scan:{...current.scan,india_only:false}},null).ok,false);
  assert.equal(judgeFeed({...current,jobs:[...current.jobs,{location:"Remote Worldwide"}]},null).ok,false);
  assert.equal(judgeFeed({...current,jobs:[...current.jobs,{location:"Unknown"}]},null).ok,false);
  assert.equal(judgeFeed({...current,jobs:[...current.jobs,{location:"London, UK"}]},null).ok,false);
});
test("global-to-India migration compares only previous India's jobs",()=>{
  const old=feed(1000);
  old.market="WORLD";
  old.scan.india_only=false;
  old.jobs=old.jobs.map((j,i)=>({...j,location:i<50?"Hyderabad, India":"New York, USA"}));
  assert.equal(judgeFeed(feed(30,1),old).ok,true,
    "expected overseas removals must not block safe migration");
  assert.equal(judgeFeed(feed(3,1),old).ok,true,
    "prior India baseline below 100 is not enough for a reliable outage threshold");
  const oldMixed=feed(1000);
  oldMixed.market="WORLD";oldMixed.scan.india_only=false;
  oldMixed.jobs=oldMixed.jobs.map((j,i)=>({...j,location:i<300?"Hyderabad, India":"New York, USA"}));
  assert.equal(judgeFeed(feed(30,1),oldMixed).ok,false,
    "unexpected loss of known India results during provider outages must still block deployment");
});
