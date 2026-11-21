/* Phase 10B: enterprise ATS integration policy.
 * Support integrations only with employer/partner authorization or a documented
 * public job-board API and verified employer board identity. Never scrape
 * private endpoints, guess a board slug or turn portal links into fake jobs.
 */
const engines=Object.freeze({
  greenhouse:Object.freeze({mode:"public-board-api",liveEligible:true,review:"Documented public employer job-board API; individual boards must be verified"}),
  ashby:Object.freeze({mode:"public-board-api",liveEligible:true,review:"Documented public posting API; listed vacancies only"}),
  lever:Object.freeze({mode:"public-board-api",liveEligible:true,review:"Public postings API; read-only with pagination"}),
  workday:Object.freeze({mode:"partner-approval-required",liveEligible:false,review:"No generic unapproved CXS harvesting. Obtain employer-authorized job distribution feed or integration approval"}),
  successfactors:Object.freeze({mode:"partner-approval-required",liveEligible:false,review:"SAP Recruiting Posting/OData integration permissions or employer-provided public feed required"}),
  oracle_recruiting:Object.freeze({mode:"partner-approval-required",liveEligible:false,review:"Oracle Recruiting REST resources and job distribution require proper tenant/partner privileges"}),
  employer_specific:Object.freeze({mode:"manual-official-portal",liveEligible:false,review:"Use verified official portal unless employer documents and authorizes an export interface"})
});
function classify(entry){
  if(!entry||typeof entry!=="object")return null;
  const provider=String(entry.provider||"").toLowerCase();
  const decision=engines[provider];
  if(!decision)return null;
  return {provider,mode:decision.mode,liveEligible:decision.liveEligible,review:decision.review};
}
function eligibleForPublicScan(entry){
  const status=classify(entry);
  return Boolean(status?.liveEligible && /^[a-zA-Z0-9_-]{2,90}$/.test(String(entry?.slug||"")) &&
    String(entry?.name||"").trim());
}
module.exports=Object.freeze({engines,classify,eligibleForPublicScan});
