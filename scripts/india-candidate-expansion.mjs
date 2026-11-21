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
import {createRequire} from "node:module";
const {entryOpportunity}=createRequire(import.meta.url)("../job-text.js");
const enterpriseDirectory=createRequire(import.meta.url)("../enterprise-careers.json");
// Exact employer identities only: no substring matching (e.g. "Amazonian"
// must not count as Amazon), and never infer an open vacancy from a portal URL.
const ENTERPRISE_ALIASES={
  tcs:["tcs","tata consultancy services"],
  accenture:["accenture"],
  wipro:["wipro","wipro limited"],
  infosys:["infosys","infosys limited"],
  ibm:["ibm","international business machines"],
  capgemini:["capgemini"],
  google:["google","google llc"],
  microsoft:["microsoft","microsoft corporation"],
  amazon:["amazon","amazon web services","aws"],
  oracle:["oracle","oracle corporation"],
  adobe:["adobe","adobe inc"],
  servicenow:["servicenow","service now"],
  atlassian:["atlassian"]
};
const employerIdentity=name=>String(name||"").toLowerCase()
  .replace(/[^a-z0-9]+/g," ").trim();
export function measureEnterpriseCoverage(jobs){
  const lookup=new Map();
  for(const company of enterpriseDirectory.companies){
    for(const alias of ENTERPRISE_ALIASES[company.id]||[])
      lookup.set(employerIdentity(alias),company.id);
  }
  const byId=new Map(enterpriseDirectory.companies.map(company=>[company.id,{
    id:company.id,name:company.name,group:company.group,postings:0,
    entry_positions:0,explicit_zero_experience:0
  }]));
  const seen=new Set();
  for(const job of jobs){
    const url=typeof job?.url==="string"?job.url.trim().toLowerCase():"";
    if(!url||seen.has(url))continue;
    seen.add(url);
    const id=lookup.get(employerIdentity(job.company));
    if(!id)continue;
    const row=byId.get(id),entry=entryOpportunity(job);
    row.postings++;
    if(entry.level==="fresher"||entry.level==="early")row.entry_positions++;
    if(entry.level==="fresher"&&entry.basis==="explicit")row.explicit_zero_experience++;
  }
  const companies=[...byId.values()].filter(row=>row.postings>0)
    .sort((a,b)=>b.entry_positions-a.entry_positions||b.postings-a.postings||
      a.name.localeCompare(b.name));
  return {
    directory_companies:enterpriseDirectory.companies.length,
    employers_with_published_jobs:companies.length,
    employers_with_entry_positions:companies.filter(row=>row.entry_positions>0).length,
    published_jobs:companies.reduce((n,row)=>n+row.postings,0),
    published_entry_positions:companies.reduce((n,row)=>n+row.entry_positions,0),
    companies
  };
}
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
  // Priority is based on verified prior India results, never the candidate's
  // marketing focus label. Keep stable input order for ties and fresh leads.
  const pending=candidates.filter(s=>!existing.has(KEY(s)))
    .map((source,index)=>({source,index}))
    .sort((a,b)=>{
      const score=source=>{
        const prior=priorRecord(previousHealth,KEY(source));
        const count=Number(prior?.entry_positions);
        return prior?.status==="active"&&Number.isSafeInteger(count)&&count>0?
          Math.min(count,1000):0;
      };
      return score(b.source)-score(a.source)||a.index-b.index;
    }).map(row=>row.source);
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
  let entryPositions=0,explicitZeroExperience=0,focusBoardsWithEntry=0;
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
        // Focus is a discovery hint, NOT proof that every job on the board
        // accepts freshers. Count only evidence in actual recent India jobs.
        const entry=recent.jobs.map(entryOpportunity);
        const entryCount=entry.filter(x=>x.level==="fresher"||x.level==="early").length;
        const explicitCount=entry.filter(x=>x.level==="fresher"&&x.basis==="explicit").length;
        entryPositions+=entryCount;
        explicitZeroExperience+=explicitCount;
        if(s.focus==="fresher"&&entryCount>0)focusBoardsWithEntry++;
        accepted.push({source:s,jobs:recent.jobs,scannedCount:jobs.length,
          entryCount,explicitCount});
        history[key]={status:"active",consecutive_failures:0,
          entry_positions:entryCount};
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
      discovered:true,focus:a.source.focus||null,
      entry_positions:a.entryCount,explicit_zero_experience:a.explicitCount})),
    report:{candidates:candidates.length,already_curated:candidates.length-pending.length,
      checked:runnable.length,quarantined:skipped,activated:accepted.length,
      fresher_focus_checked:runnable.filter(s=>s.focus==="fresher").length,
      fresher_focus_activated:accepted.filter(a=>a.source.focus==="fresher").length,
      fresher_focus_with_entry_jobs:focusBoardsWithEntry,
      entry_positions:entryPositions,
      explicit_zero_experience_positions:explicitZeroExperience,
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
  // These are measured AFTER deduplication and publication balancing. Board
  // totals can double-count a vacancy shared across multiple employer feeds.
  const normalizedUrl=job=>typeof job?.url==="string"?job.url.trim().toLowerCase():"";
  const baseUrls=new Set(feed.jobs.map(normalizedUrl));
  const candidateUrls=new Set(expansion.jobs.map(normalizedUrl));
  const publishedCandidateJobs=jobs.filter(job=>candidateUrls.has(normalizedUrl(job))&&
    !baseUrls.has(normalizedUrl(job)));
  const entryJobs=publishedCandidateJobs.map(job=>({job,entry:entryOpportunity(job)}))
    .filter(row=>row.entry.level==="fresher"||row.entry.level==="early");
  const employers=new Map();
  for(const {job} of entryJobs){
    const name=clean(job.company).slice(0,120);
    if(name)employers.set(name,(employers.get(name)||0)+1);
  }
  const publishedEvidence={
    unique_candidate_jobs:publishedCandidateJobs.length,
    unique_candidate_entry_positions:entryJobs.length,
    unique_candidate_explicit_zero_experience:entryJobs.filter(row=>
      row.entry.level==="fresher"&&row.entry.basis==="explicit").length,
    employers_with_entry_positions:employers.size,
    employer_breakdown:[...employers].sort((a,b)=>b[1]-a[1]||
      a[0].localeCompare(b[0])).slice(0,20)
      .map(([name,positions])=>({name,positions}))
  };
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
      candidate_discovery:{...expansion.report,published_evidence:publishedEvidence,
        enterprise_coverage:measureEnterpriseCoverage(jobs)},
      candidate_health:expansion.history}};
}
