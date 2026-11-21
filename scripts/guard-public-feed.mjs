/**
 * Phase 10 release guard. Reject an unexpectedly empty or severely degraded
 * employer scan before replacing a working public job feed.
 * Runs in CI, does not read private user/applicant information.
 */
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import path from "node:path";
import {createRequire} from "node:module";
const {isIndiaLocation}=createRequire(import.meta.url)("../india-jobs.js");
export function judgeFeed(next,previous){
  if(next?.schema!=="careerops.public-jobs.v1" || !Array.isArray(next?.jobs))
    return {ok:false,reason:"Invalid public job feed schema"};
  if(next.market!=="IN"||next.scan?.india_only!==true)
    return {ok:false,reason:"Refusing to publish a feed without an India-only scope"};
  if(!next.jobs.length)return {ok:false,reason:"Refusing to publish an empty job feed"};
  if(next.jobs.some(job=>!isIndiaLocation(job?.location)))
    return {ok:false,reason:"Public feed includes non-India or unverified job locations"};
  if(next.scan?.status==="failed")return {ok:false,reason:"Every employer source failed"};
  const sources=Array.isArray(next.source_health)?next.source_health:[];
  if(sources.length>5){
    const healthy=sources.filter(source=>source.status==="ok").length;
    if(healthy<Math.ceil(sources.length*0.4))
      return {ok:false,reason:"Most employer boards could not be reached"};
  }
  // During the one-time global-to-India transition compare only prior India
  // postings; the expected removal of overseas jobs is not source degradation.
  const previousIndiaCount=previous?.schema==="careerops.public-jobs.v1"&&
    Array.isArray(previous.jobs) ?
    previous.jobs.filter(job=>isIndiaLocation(job?.location)).length : 0;
  if(previousIndiaCount>=100&&next.jobs.length<previousIndiaCount*.20&&
    Number(next.scan?.error_count)>0)
      return {ok:false,reason:"Large India job-feed drop during a partial source outage"};
  return {ok:true,reason:"Feed passes safe-publication checks"};
}
async function run(){
  const next=JSON.parse(readFileSync(process.argv[2]||"public/data/jobs.json","utf8"));
  let previous=null;
  const url=process.env.PREVIOUS_PUBLIC_FEED||"https://chennamatta889.github.io/career-ops-cloud/data/jobs.json";
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(8500),headers:{Accept:"application/json"}});
    if(r.ok && Number(r.headers.get("content-length")||0)<12*1024*1024){
      const body=await r.text();
      if(body.length<12*1024*1024)previous=JSON.parse(body);
    }
  }catch(e){console.warn("Old public feed unavailable; validating this scan independently.");}
  const verdict=judgeFeed(next,previous);
  console.log(verdict.reason);
  if(!verdict.ok)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
