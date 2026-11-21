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
const PROVIDERS=new Set(["greenhouse","ashby","lever"]);
const KEY=s=>s.provider+":"+s.slug.toLowerCase();
const clean=s=>typeof s==="string"?s.trim():"";
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
  boardTimeoutMs=12000,maxRequestsPerBoard=8,now=new Date()
}){
  checkCandidateCatalog(candidates);
  if(!Array.isArray(curatedSources)||typeof scanBoard!=="function"||typeof isIndiaLocation!=="function")
    throw Error("Missing trusted scan dependencies");
  const existing=new Set(curatedSources.map(KEY));
  const pending=candidates.filter(s=>!existing.has(KEY(s)));
  let cursor=0,failed=0,noIndia=0,noRecent=0,inspected=0;
  let undatedExcluded=0,outdatedExcluded=0,futureExcluded=0;
  const accepted=[],errors=[];
  const worker=async()=>{
    while(cursor<pending.length){
      const s=pending[cursor++];
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
        if(!indiaJobs.length){noIndia++;continue;}
        const recent=filterRecentJobs(indiaJobs,now);
        undatedExcluded+=recent.undated;
        outdatedExcluded+=recent.outdated;
        futureExcluded+=recent.future;
        if(!recent.jobs.length){noRecent++;continue;}
        // A candidate must return real normalized public ATS postings; never
        // synthesize title, location or application URL from its slug alone.
        if(recent.jobs.some(j=>!j?.title||!j?.url||!j?.company||
          !j.url.startsWith("https://")))throw Error("Invalid public candidate posting");
        accepted.push({source:s,jobs:recent.jobs,scannedCount:jobs.length});
        inspected+=jobs.length;
      }catch(e){
        failed++;
        if(errors.length<12)errors.push({board:s.slug,provider:s.provider,
          reason:String(e?.message||"Candidate unavailable").slice(0,140)});
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(concurrency,pending.length,10)},
    ()=>worker()));
  accepted.sort((a,b)=>KEY(a.source).localeCompare(KEY(b.source)));
  return {
    jobs:accepted.flatMap(a=>a.jobs),
    health:accepted.map(a=>({provider:a.source.provider,board:a.source.slug,
      name:a.source.name,status:"ok",count:a.jobs.length,scanned_count:a.scannedCount,
      discovered:true})),
    report:{candidates:candidates.length,already_curated:candidates.length-pending.length,
      checked:pending.length,activated:accepted.length,no_india:noIndia,
      no_recent_india:noRecent,unavailable:failed,
      undated_excluded:undatedExcluded,outdated_excluded:outdatedExcluded,
      future_excluded:futureExcluded,
      inspected_positions:inspected,india_positions:accepted.reduce((n,a)=>n+a.jobs.length,0)},
    errors
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
      candidate_discovery:expansion.report}};
}
