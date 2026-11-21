#!/usr/bin/env node
/**
 * Public all-role ATS discovery. No user profile, keyword exclusions,
 * seniority restrictions, experience ceiling, or country filters.
 * Sources are selected employers, not all employers worldwide.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";

const require=createRequire(import.meta.url);
const {classify,categories}=require("../job-categories.js");
const {plainText}=require("../job-text.js");
const MAX_RESPONSE_BYTES=10*1024*1024;
export const MAX_PUBLISHED=500;
const clean=(value,n=200)=>typeof value==="string" ? value.replace(/[\u0000-\u001f\u007f]+/g," ").replace(/\s+/g," ").trim().slice(0,n):"";
function date(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}/.test(value))return null;
  const parsed=new Date(value);
  return Number.isFinite(parsed.getTime())?parsed.toISOString().slice(0,10):null;
}
function assertSource(source){
  if(!source || !["greenhouse","ashby"].includes(source.provider) ||
    !/^[a-zA-Z0-9_-]{2,90}$/.test(source.slug) || !clean(source.name,120))
    throw Error("Invalid public employer board");
}
function normalize(source,job){
  if(!job || source.provider==="ashby"&&job.isListed===false)return null;
  const rawId=String(job.id||"");
  if(source.provider==="greenhouse"?!/^\d{3,18}$/.test(rawId):
      !/^[A-Za-z0-9_-]{3,110}$/.test(rawId))return null;
  const title=clean(plainText(job.title,160),160);
  if(!title)return null;
  const gh=source.provider==="greenhouse";
  const department=clean(plainText(gh?
    (Array.isArray(job.departments)?job.departments.map(x=>x?.name).filter(Boolean).join(" / "):""):
    (job.department||job.team||job.jobDepartment||""),130),130);
  const location=clean(plainText(gh?job.location?.name:(job.location||job.locationName||job.workplaceType),160),160)||"Not specified";
  // Keep paragraph breaks and bullet points in the published excerpt.
  // The browser applies the same sanitizer again to legacy saved listings.
  const desc=plainText(gh?job.content:(job.descriptionPlain||job.descriptionHtml||""),2500);
  const published=date(gh?job.first_published||job.updated_at:job.publishedAt||job.updatedAt);
  const publicUrl=gh?
    "https://job-boards.greenhouse.io/"+source.slug+"/jobs/"+rawId:
    "https://jobs.ashbyhq.com/"+source.slug+"/"+rawId;
  return {
    id:"ats-"+createHash("sha256").update(source.provider+":"+source.slug+":"+rawId).digest("hex").slice(0,20),
    title,company:clean(source.name,120),location,department,
    category:classify(title,department),description:desc,
    url:publicUrl,skills:[],requiredExperience:"",
    posted_at:published,addedAt:published,source:gh?"Greenhouse public board":"Ashby public board"
  };
}
async function limitedJson(url,fetchImpl){
  const response=await fetchImpl(url,{method:"GET",redirect:"error",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(16000)});
  if(!response.ok)throw Error("HTTP "+response.status);
  if(Number(response.headers?.get?.("content-length")||0)>MAX_RESPONSE_BYTES)
    throw Error("Employer API response is too large");
  const reader=response.body?.getReader();
  if(!reader)throw Error("Employer API response is unreadable");
  const chunks=[];let total=0;
  try{
    for(;;){
      const {value,done}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_RESPONSE_BYTES)throw Error("Employer API exceeded the response limit");
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const joined=new Uint8Array(total);let pos=0;
  for(const part of chunks){joined.set(part,pos);pos+=part.length;}
  return JSON.parse(new TextDecoder().decode(joined));
}
export async function scanBoard(source,fetchImpl=fetch){
  assertSource(source);
  const url=source.provider==="greenhouse"?
    "https://boards-api.greenhouse.io/v1/boards/"+source.slug+"/jobs?content=true":
    "https://api.ashbyhq.com/posting-api/job-board/"+source.slug;
  const data=await limitedJson(url,fetchImpl);
  if(!data||!Array.isArray(data.jobs))throw Error("Employer API response has no jobs array");
  return data.jobs.map(job=>normalize(source,job)).filter(Boolean);
}
export function balanceJobs(all,limit=MAX_PUBLISHED){
  const buckets=new Map(categories.map(cat=>[cat,[]]));
  const seen=new Set(),rows=all.slice().sort((a,b)=>
    String(b.posted_at||"").localeCompare(String(a.posted_at||"")) ||
    String(a.company).localeCompare(String(b.company)));
  for(const job of rows){
    if(!job?.url||!job?.title||seen.has(job.url.toLowerCase()))continue;
    seen.add(job.url.toLowerCase());
    buckets.get(buckets.has(job.category)?job.category:"Other").push(job);
  }
  const output=[];
  let found=true;
  while(found && output.length<limit){
    found=false;
    for(const category of categories){
      const bucket=buckets.get(category);
      if(bucket.length&&output.length<limit){output.push(bucket.shift());found=true;}
    }
  }
  return output;
}
export async function runScan({sources,fetchImpl=fetch,concurrency=5,limit=MAX_PUBLISHED}={}){
  if(!Array.isArray(sources)||sources.length<1)throw Error("No employer sources configured");
  const seenSources=new Set();
  for(const source of sources){
    assertSource(source);
    const identity=source.provider+":"+source.slug.toLowerCase();
    if(seenSources.has(identity))throw Error("Duplicate board "+identity);
    seenSources.add(identity);
  }
  const jobs=[],errors=[];let found=0,next=0;
  await Promise.all(Array.from({length:Math.min(sources.length,Math.max(1,Math.min(8,concurrency)))},async()=>{
    while(next<sources.length){
      const source=sources[next++];
      try{
        const openings=await scanBoard(source,fetchImpl);
        jobs.push(...openings);found+=openings.length;
      }catch(e){errors.push({board:source.name,reason:clean(e?.message||"Source unavailable",140)});}
    }
  }));
  const status=errors.length===sources.length?"failed":errors.length?"partial":"success";
  const published=status==="failed"?[]:balanceJobs(jobs,limit);
  return {
    schema:"careerops.public-jobs.v1",generated_at:new Date().toISOString(),
    scope:"IT and non-IT roles at selected public Greenhouse/Ashby employers, worldwide. Not an exhaustive job search.",
    scan:{status,date:new Date().toISOString().slice(0,10),scanned:sources.length,
      found,matched:published.length,error_count:errors.length,max_published:limit,
      message:errors.length?"Some employers were unavailable; results may be incomplete.":
        "All published roles scanned without title, country, experience or seniority exclusions."},
    category_counts:Object.fromEntries(categories.map(c=>[c,published.filter(j=>j.category===c).length])),
    source_errors:errors.slice(0,30),jobs:published
  };
}
async function main(){
  const sourceFile=process.env.JOB_SOURCES_FILE||"scripts/universal-job-sources.json";
  const output=process.env.FEED_OUTPUT||"public/data/jobs.json";
  const sources=JSON.parse(readFileSync(sourceFile,"utf8")).sources;
  const feed=await runScan({sources});
  mkdirSync(path.dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(feed,null,2)+"\n",{mode:0o644});
  console.log(JSON.stringify({status:feed.scan.status,boards:feed.scan.scanned,
    inspected:feed.scan.found,published:feed.jobs.length,
    errors:feed.scan.error_count,categories:feed.category_counts},null,2));
  if(feed.scan.status==="failed")process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
