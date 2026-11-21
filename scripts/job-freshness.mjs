/**
 * Rolling UTC 30-day recency requirement for published India job feeds.
 * Use actual employer publication/republication timestamps. Lever's public
 * posting API exposes createdAt instead: a role created within the window
 * cannot have been published before its creation, so recent creation is a
 * conservative eligibility signal, never labeled as its published date.
 * Never use ATS updated_at / updatedAt as evidence that an older job is new.
 */
export const MAX_JOB_AGE_DAYS=30;
const MS_PER_DAY=86400000;
export function isoDay(value){
  if(typeof value==="number"){
    if(!Number.isSafeInteger(value)||value<0)return null;
    const parsed=new Date(value);
    return Number.isFinite(parsed.getTime())?parsed.toISOString().slice(0,10):null;
  }
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value))return null;
  const year=Number(value.slice(0,4));
  const month=Number(value.slice(5,7));
  const day=Number(value.slice(8,10));
  const check=new Date(Date.UTC(year,month-1,day));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;
  if(value.length>10){
    const parsed=new Date(value);
    if(!Number.isFinite(parsed.getTime()))return null;
    return parsed.toISOString().slice(0,10);
  }
  return value;
}
export function cutoffDay(now=new Date(),maxDays=MAX_JOB_AGE_DAYS){
  const today=isoDay(now instanceof Date?now.toISOString():now);
  if(!today||!Number.isSafeInteger(maxDays)||maxDays<1||maxDays>366)
    throw Error("Invalid freshness cutoff");
  return new Date(Date.parse(today+"T00:00:00Z")-maxDays*MS_PER_DAY).toISOString().slice(0,10);
}
export function hasRecentDate(job,now=new Date(),maxDays=MAX_JOB_AGE_DAYS){
  const today=isoDay(now instanceof Date?now.toISOString():now);
  const stamp=isoDay(job?.freshness_date);
  if(!today||!stamp)return false;
  const cutoff=cutoffDay(now,maxDays);
  return stamp>=cutoff&&stamp<=today;
}
export function filterRecentJobs(jobs,now=new Date(),maxDays=MAX_JOB_AGE_DAYS){
  const recent=[],undated=[],outdated=[],future=[];
  const today=isoDay(now instanceof Date?now.toISOString():now);
  const cutoff=cutoffDay(now,maxDays);
  for(const job of jobs||[]){
    const stamp=isoDay(job?.freshness_date);
    if(!stamp)undated.push(job);
    else if(stamp>today)future.push(job);
    else if(stamp<cutoff)outdated.push(job);
    else recent.push(job);
  }
  return {jobs:recent,undated:undated.length,outdated:outdated.length,future:future.length,
    cutoff,today,maxDays};
}
