import test from "node:test";
import assert from "node:assert/strict";
import {judgeFeed} from "./guard-public-feed.mjs";
const feed=(count,errors=0,healthy=20,total=20)=>({
  schema:"careerops.public-jobs.v1",jobs:Array.from({length:count},(_,i)=>({id:i})),
  scan:{status:errors?"partial":"success",error_count:errors},
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
