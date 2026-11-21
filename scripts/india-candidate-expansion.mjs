/**
 * Opt-in, anonymous India employer discovery. Candidate slugs are leads, not
 * active sources. Only an ATS feed that responds with verified India postings
 * contributes jobs or healthy-board counts to the public feed.
 *
 * Caps: 10 concurrent candidates, 12s per board, 8 HTTP requests per board.
 * Source urls are fixed by scanBoard; no arbitrary remote addresses or proxies.
 * Candidate failures never replace or degrade the 80 curated employer sources.
 */
import {filterRecentJobs} from "./job-freshness.mjs";
const PROVIDERS=new Set(["greenhouse","ashby","lever","smartrecruiters"]);
const KEY=s=>s.provider+":"+s.slug.toLowerCase();
const clean=s=>typeof s==="string"?s.trim():"";
const MAX_RETRY_DAYS=7;
const DAY=86400000;
function priorRecord(history,key){
  if(!history||typeof history!=="object"||Array.isArray(history))return null;
  const row=history[key];
  return row&&typeof row==="object"&&!Array.isArray(row)?row:null;
}
function failureClass(error){
  const message=String(error?.message||error||"").slice(0,140);
  const match=message.match(/\bHTTP\s+(\d{3})\b/i);
  const code=match?Number(match[1]):null;
  // Access-denied and missing boards are costly to retry; transient failures
  // get short backoff and a scheduled retry, not permanent exclusion.
  return {kind:code===404?"not_found":code===403||code===401?"access_denied":
    code===429?"rate_limited":code>=500?"server_error":
    /time|abort/i.test(message)?"timeout":"other",
    retryDays:code===404||code===403||code===401?MAX_RETRY_DAYS:1};
}
function validIsoDay(day){return typeof day==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&
  !Number.isNaN(Date.parse(day+"T00:00:00Z"))&&
  new Date(day+"T00:00:00Z").toISOString().slice(0,10)===day;}
function quarantined(row,now){
  return row&&row.consecutive_failures>=2&&validIsoDay(row.retry_after)&&
    Date.parse(row.retry_after+"T00:00:00Z")>Date.parse(now.toISOString().slice(0,10)+"T00:00:00Z");
}
export function checkCandidateCatalog(candidates){
  if(!Array.isArray(candidates)||candidates.length>1000)
    throw Error("Invalid India employer candidate registry");
  const seen=new Set();
  for(const s of candidates){
    if(!s||!PROVIDERS.has(s.provider)||!/^[a-zA-Z0-9_-]{2,90}$/.test(s.slug||"")||
      !clean(s.name)||s.name.length>120)
      throw Error("Invalid employer candidate");
    if(seen.has(KEY(s)))throw Error("Duplicate India employer candidate "+KEY(s));
    seen.add(KEY(s));
  }
  return true;
}
export async function discoverIndiaCandidates({
  candidates,curatedSources,scanBoard,isIndiaLocation,fetchImpl=fetch,concurrency=8,
  boardTimeoutMs=12000,maxRequestsPerBoard=8,now=new Date(),previousHealth={}
}){
  checkCandidateCatalog(candidates);
  if(!Array.isArray(curatedSources)||typeof scanBoard!=="function"||typeof isIndiaLocation!=="function")
    throw Error("Missing trusted scan dependencies");
  const existing=new Set(curatedSources.map(KEY));
  const pending=candidates.filter(s=>!existing.has(KEY(s)));
  // Only trusted catalog keys can be carried forward; stale or arbitrary
  // entries in an older public feed cannot add requests or jobs.
  const history={};
  const runnable=[];
  let skipped=0;
  for(const source of pending){
    const key=KEY(source);
    const prior=priorRecord(previousHealth,key);
    if(quarantined(prior,now)){
      skipped++;
      history[key]={status:"quarantined",consecutive_failures:prior.consecutive_failures,
        retry_after:prior.retry_after,kind:prior.kind||"other"};
    }else runnable.push(source);
  }
  let cursor=0,failed=0,noIndia=0,noRecent=0,inspected=0;
  let undatedExcluded=0,outdatedExcluded=0,futureExcluded=0;
  const accepted=[],errors=[];
  const worker=async()=>{
    while(cursor<runnable.length){
      const s=runnable[cursor++];
      const key=KEY(s);
      const prior=priorRecord(previousHealth,key);
      const deadline=AbortSignal.timeout(boardTimeoutMs);
      let count=0;
      try{
        const jobs=await scanBoard(s,async(url,options={})=>{
          if(++count>maxRequestsPerBoard)
            throw Error("Candidate exceeded safe pagination budget");
          if(deadline.aborted)throw Error("Candidate exceeded board time budget");
          return fetchImpl(url,{...options,
            signal:options.signal?AbortSignal.any([options.signal,deadline]):deadline});
        });
        if(deadline.aborted)throw Error("Candidate exceeded board time budget");
        if(!Array.isArray(jobs)||jobs.length>10000)
          throw Error("Invalid candidate board result");
        const indiaJobs=jobs.filter(j=>isIndiaLocation(j?.location));
        if(!indiaJobs.length){noIndia++;history[key]={status:"no_india",consecutive_failures:0};continue;}
        const recent=filterRecentJobs(indiaJobs,now);
        undatedExcluded+=recent.undated;
        outdatedExcluded+=recent.outdated;
        futureExcluded+=recent.future;
        if(!recent.jobs.length){noRecent++;history[key]={status:"no_recent",consecutive_failures:0};continue;}
        // A candidate must return real normalized public ATS postings; never
        // synthesize title, location or application URL from its slug alone.
        if(recent.jobs.some(j=>!j?.title||!j?.url||!j?.company||
          !j.url.startsWith("https://")))throw Error("Invalid public candidate posting");
        accepted.push({source:s,jobs:recent.jobs,scannedCount:jobs.length});
        history[key]={status:"active",consecutive_failures:0};
        inspected+=jobs.length;
      }catch(e){
        failed++;
        const failure=failureClass(e);
        const failures=Math.min(1000,Math.max(0,Number(prior?.consecutive_failures)||0)+1);
        const retryDay=new Date(Date.parse(now.toISOString().slice(0,10)+"T00:00:00Z")+
          failure.retryDays*DAY).toISOString().slice(0,10);
        history[key]={status:"unavailable",consecutive_failures:failures,
          retry_after:retryDay,kind:failure.kind};
        if(errors.length<12)errors.push({board:s.slug,provider:s.provider,
          reason:String(e?.message||"Candidate unavailable").slice(0,140)});
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(concurrency,runnable.length,10)},
    ()=>worker()));
  accepted.sort((a,b)=>KEY(a.source).localeCompare(KEY(b.source)));
  return {
    jobs:accepted.flatMap(a=>a.jobs),
    health:accepted.map(a=>({provider:a.source.provider,board:a.source.slug,
      name:a.source.name,status:"ok",count:a.jobs.length,scanned_count:a.scannedCount,
      discovered:true,focus:a.source.focus||null})),
    report:{candidates:candidates.length,already_curated:candidates.length-pending.length,
      checked:runnable.length,quarantined:skipped,activated:accepted.length,
      fresher_focus_checked:runnable.filter(s=>s.focus==="fresher").length,
      fresher_focus_activated:accepted.filter(a=>a.source.focus==="fresher").length,
      no_india:noIndia,
      no_recent_india:noRecent,unavailable:failed,
      undated_excluded:undatedExcluded,outdated_excluded:outdatedExcluded,
      future_excluded:futureExcluded,
      inspected_positions:inspected,india_positions:accepted.reduce((n,a)=>n+a.jobs.length,0)},
    errors,history
  };
}
export function mergeIndiaCandidates(feed,expansion,balanceJobs){
  const jobs=balanceJobs([...feed.jobs,...expansion.jobs]);
  const category_counts={};
  for(const c of Object.keys(feed.category_counts||{}))category_counts[c]=0;
  for(const job of jobs)category_counts[job.category]??=0,category_counts[job.category]++;
  return {...feed,jobs,category_counts,
    source_health:[...(feed.source_health||[]),...expansion.health],
    scan:{...feed.scan,scanned:feed.scan.scanned+expansion.health.length,
      found:feed.scan.found+expansion.report.inspected_positions,matched:jobs.length,
      undated_excluded:(feed.scan.undated_excluded||0)+(expansion.report.undated_excluded||0),
      outdated_excluded:(feed.scan.outdated_excluded||0)+(expansion.report.outdated_excluded||0),
      future_excluded:(feed.scan.future_excluded||0)+(expansion.report.future_excluded||0),
      candidate_discovery:expansion.report,
      candidate_health:expansion.history}};
}
