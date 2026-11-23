import test from "node:test";
import assert from "node:assert/strict";
import {fetchPreviousFeed} from "../scripts/guard-public-feed.mjs";
const baseline={schema:"careerops.public-jobs.v1",market:"IN",jobs:[{id:"a"}]};
const response=(status,body,headers={})=>({ok:status===200,status,headers:{get:k=>headers[k]??null},text:async()=>body});
test("reads canonical root baseline with a valid public feed",async()=>{
  let requested;
  const result=await fetchPreviousFeed(async url=>{requested=url;return response(200,JSON.stringify(baseline));});
  assert.equal(requested,process.env.PREVIOUS_PUBLIC_FEED||"https://chennamatta889.github.io/data/jobs.json");
  assert.deepEqual(result,baseline);
});
test("blocks unavailable, malformed and non-India production baselines",async()=>{
  for(const reply of [response(404,"missing"),response(200,"{bad"),response(200,JSON.stringify({...baseline,market:"US"})),response(200,JSON.stringify({...baseline,jobs:null})),response(200,"{}",{"content-length":String(12*1024*1024)})]){
    await assert.rejects(fetchPreviousFeed(async()=>reply));
  }
});
test("blocks fetch failures rather than silently skipping regression checks",async()=>{
  await assert.rejects(fetchPreviousFeed(async()=>{throw new Error("network timeout");}),/network timeout/);
});
