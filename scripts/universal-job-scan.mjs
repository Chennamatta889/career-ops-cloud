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
const {plainText,experienceRequirement}=require("../job-text.js");
const MAX_RESPONSE_BYTES=10*1024*1024;
const clean=(value,n=200)=>typeof value==="string" ? value.replace(/[\u0000-\u001f\u007f]+/g," ").replace(/\s+/g," ").trim().slice(0,n):"";
function date(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}/.test(value))return null;
  const parsed=new Date(value);
  return Number.isFinite(parsed.getTime())?parsed.toISOString().slice(0,10):null;
}
// Display ISO country names for discover's India location filter; no inferred location.
function smartRecruitersLocation(location){
  if(!location || typeof location!=="object")return "Not specified";
  const code=clean(location.country,3).toUpperCase();
  const country=({IN:"India",US:"United States",GB:"United Kingdom",
    CA:"Canada",AU:"Australia",DE:"Germany",FR:"France",SG:"Singapore"})[code]||code;
  return clean([location.remote?"Remote":null,location.city,location.region,country]
    .filter(value=>typeof value==="string"&&value.trim()).join(", "),160)||"Not specified";
}
function assertSource(source){
  if(!source || !["greenhouse","ashby","lever","smartrecruiters"].includes(source.provider) ||
    !/^[a-zA-Z0-9_-]{2,90}$/.test(source.slug) || !clean(source.name,120))
    throw Error("Invalid public employer board");
}
function normalize(source,job){
  if(!job || source.provider==="ashby"&&job.isListed===false ||
    source.provider==="smartrecruiters"&&job.active===false)return null;
  const rawId=String(job.id||"");
  if(source.provider==="greenhouse"?!/^\d{3,18}$/.test(rawId):
      !/^[A-Za-z0-9_-]{3,110}$/.test(rawId))return null;
  const gh=source.provider==="greenhouse";
  const lever=source.provider==="lever";
  const smart=source.provider==="smartrecruiters";
  const title=clean(plainText(smart?job.name:lever?job.text:job.title,160),160);
  if(!title)return null;
  const department=clean(plainText(smart?(job.department?.label||job.function?.label||""):gh?
    (Array.isArray(job.departments)?job.departments.map(x=>x?.name).filter(Boolean).join(" / "):""):
    lever?(job.categories?.department||job.categories?.team||""):
    (job.department||job.team||job.jobDepartment||""),130),130);
  const location=clean(plainText(smart?smartRecruitersLocation(job.location):gh?job.location?.name:
    lever?(job.categories?.location||job.categories?.allLocations?.join(" / ")||job.workplaceType||""):
    (job.location||job.locationName||job.workplaceType),160),160)||"Not specified";
  // SmartRecruiters list results generally omit the full job ad. Never
  // claim experience requirements unless text was actually supplied.
  const rawDescription=smart?[
    job.jobAd?.sections?.jobDescription?.text,
    job.jobAd?.sections?.qualifications?.text
  ].filter(Boolean).join(" "):gh?job.content:
    lever?(job.descriptionPlain||job.description||job.openingPlain||""):
    (job.descriptionPlain||job.descriptionHtml||"");
  const desc=plainText(rawDescription,2500);
  const requirement=experienceRequirement(plainText(rawDescription,16000));
  // Lever's createdAt is a creation timestamp, NOT a published-on date.
  const published=date(smart?job.releasedDate:gh?job.first_published||job.updated_at:
    job.publishedAt||job.updatedAt);
  const publicUrl=smart?"https://jobs.smartrecruiters.com/"+source.slug+"/"+rawId:gh?
    "https://job-boards.greenhouse.io/"+source.slug+"/jobs/"+rawId:
    lever?"https://jobs.lever.co/"+source.slug+"/"+rawId:
    "https://jobs.ashbyhq.com/"+source.slug+"/"+rawId;
  return {
    id:"ats-"+createHash("sha256").update(source.provider+":"+source.slug+":"+rawId).digest("hex").slice(0,20),
    title,company:clean(source.name,120),location,department,
    category:classify(title,department),description:desc,
    url:publicUrl,skills:[],requiredExperience:requirement?.label||"",
    posted_at:published,addedAt:published,
    source:smart?"SmartRecruiters public board":gh?"Greenhouse public board":lever?"Lever public board":"Ashby public board"
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
  if(source.provider==="smartrecruiters"){
    // Public list endpoint returns active company postings and a totalFound
    // count. Iterate deterministically; never silently publish a partial page.
    const pageSize=100,maxPages=100,results=[];
    for(let page=0;page<maxPages;page++){
      const offset=page*pageSize;
      const url="https://api.smartrecruiters.com/v1/companies/"+source.slug+
        "/postings?limit="+pageSize+"&offset="+offset;
      const data=await limitedJson(url,fetchImpl);
      if(!data||!Array.isArray(data.content)||
         !Number.isSafeInteger(data.totalFound)||data.totalFound<0 ||
         data.content.length>pageSize)
        throw Error("SmartRecruiters public postings response is invalid");
      if(data.content.length===0&&offset<data.totalFound)
        throw Error("SmartRecruiters feed returned an incomplete page");
      results.push(...data.content.map(job=>normalize(source,job)).filter(Boolean));
      if(offset+data.content.length>=data.totalFound)return results;
      if(data.content.length<pageSize)
        throw Error("SmartRecruiters feed returned a truncated page");
    }
    throw Error("SmartRecruiters employer board exceeds the safe pagination window");
  }
  if(source.provider==="lever"){
    // Lever uses a top-level JSON array and supports skip/limit paging.
    // Page the public board instead of allowing a large employer to exceed
    // the single-response safety limit. Do not silently truncate job lists.
    const pageSize=40,maxPages=100,results=[];
    for(let page=0;page<maxPages;page++){
      const url="https://api.lever.co/v0/postings/"+source.slug+
        "?mode=json&skip="+(page*pageSize)+"&limit="+pageSize;
      const data=await limitedJson(url,fetchImpl);
      if(!Array.isArray(data))throw Error("Lever employer API response is not a postings array");
      results.push(...data.map(job=>normalize(source,job)).filter(Boolean));
      if(data.length<pageSize)return results;
    }
    throw Error("Lever employer board exceeds the safe pagination window");
  }
  const url=source.provider==="greenhouse"?
    "https://boards-api.greenhouse.io/v1/boards/"+source.slug+"/jobs?content=true":
    "https://api.ashbyhq.com/posting-api/job-board/"+source.slug;
  const data=await limitedJson(url,fetchImpl);
  if(!data||!Array.isArray(data.jobs))throw Error("Employer API response has no valid postings array");
  return data.jobs.map(job=>normalize(source,job)).filter(Boolean);
}
export function balanceJobs(all){
  // Diversify jobs without imposing an arbitrary publishing limit.
  const buckets=new Map(categories.map(cat=>[cat,[]]));
  const seen=new Set(),rows=all.slice().sort((a,b)=>
    String(b.posted_at||"").localeCompare(String(a.posted_at||"")) ||
    String(a.company).localeCompare(String(b.company)));
  for(const job of rows){
    if(!job?.url||!job?.title||seen.has(job.url.toLowerCase()))continue;
    seen.add(job.url.toLowerCase());
    const category=buckets.has(job.category)?job.category:"Other";
    buckets.get(category).push(job);
  }
  const positions=new Map(categories.map(cat=>[cat,0]));
  const output=[];
  let more=true;
  while(more){
    more=false;
    for(const category of categories){
      const bucket=buckets.get(category),index=positions.get(category);
      if(index<bucket.length){
        output.push(bucket[index]);
        positions.set(category,index+1);
        more=true;
      }
    }
  }
  return output;
}
export async function runScan({sources,fetchImpl=fetch,concurrency=5}={}){
  if(!Array.isArray(sources)||sources.length<1)throw Error("No employer sources configured");
  const seenSources=new Set();
  for(const source of sources){
    assertSource(source);
    const identity=source.provider+":"+source.slug.toLowerCase();
    if(seenSources.has(identity))throw Error("Duplicate board "+identity);
    seenSources.add(identity);
  }
  const jobs=[],errors=[],health=new Array(sources.length);
  let found=0,next=0;
  await Promise.all(Array.from({length:Math.min(sources.length,Math.max(1,Math.min(8,concurrency)))},async()=>{
    while(next<sources.length){
      const sourceIndex=next++;
      const source=sources[sourceIndex];
      const common={provider:source.provider,board:source.slug,name:source.name};
      try{
        const openings=await scanBoard(source,fetchImpl);
        jobs.push(...openings);found+=openings.length;
        health[sourceIndex]={...common,status:"ok",count:openings.length};
      }catch(e){
        errors.push({board:source.name,reason:clean(e?.message||"Source unavailable",140)});
        health[sourceIndex]={...common,status:"error",count:0};
      }
    }
  }));
  const status=errors.length===sources.length?"failed":errors.length?"partial":"success";
  const published=status==="failed"?[]:balanceJobs(jobs);
  return {
    schema:"careerops.public-jobs.v1",generated_at:new Date().toISOString(),
    scope:"IT and non-IT roles at selected public Greenhouse/Ashby/Lever/SmartRecruiters employers, worldwide. Not an exhaustive job search.",
    scan:{status,date:new Date().toISOString().slice(0,10),scanned:sources.length,
      found,matched:published.length,error_count:errors.length,
      message:errors.length?"Some employers were unavailable; results may be incomplete.":
        "All published roles scanned without title, country, experience or seniority exclusions."},
    category_counts:Object.fromEntries(categories.map(c=>[c,published.filter(j=>j.category===c).length])),
    source_errors:errors.slice(0,30),source_health:health,jobs:published
  };
}
async function main(){
  const sourceFile=process.env.JOB_SOURCES_FILE||"scripts/universal-job-sources.json";
  const output=process.env.FEED_OUTPUT||"public/data/jobs.json";
  const sources=JSON.parse(readFileSync(sourceFile,"utf8")).sources;
  const feed=await runScan({sources});
  mkdirSync(path.dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(feed)+"\n",{mode:0o644});
  console.log(JSON.stringify({status:feed.scan.status,boards:feed.scan.scanned,
    inspected:feed.scan.found,published:feed.jobs.length,
    errors:feed.scan.error_count,categories:feed.category_counts},null,2));
  // Release diagnostics only: job counts and titles are never added to visible UI.
  const serviceNowJobs=feed.jobs.filter(j=>/\bservice[\s-]?now\b/i.test(j.title));
  console.log("ServiceNow role titles in published employer scan:",serviceNowJobs.length);
  const serviceNowEmployer=feed.jobs.filter(j=>j.company==="ServiceNow");
  console.log("ServiceNow employer postings in public scan:",serviceNowEmployer.length,
    "India:",serviceNowEmployer.filter(j=>/\bIndia\b/i.test(j.location)).length);
  console.log("ServiceNow sample titles:",JSON.stringify(serviceNowJobs.slice(0,12).map(j=>
    ({title:j.title,company:j.company,location:j.location}))));
  if(feed.source_errors.length)
    console.warn("Unavailable boards:",JSON.stringify(feed.source_errors.slice(0,15)));
  if(feed.scan.status==="failed")process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
