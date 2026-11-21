/* Phase 09: OPTIONAL, user-pasted application acknowledgement analysis.
 * No Gmail permissions, network requests, mailbox polling, or auto-stage changes.
 * The entire message is examined locally and discarded when the form is cleared.
 */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CareerOpsApplicationEmail=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const clean=(value,limit=16000)=>String(value||"").replace(/[\u200b-\u200f\uFEFF]/g,"")
    .replace(/<[^>]{0,500}>/g," ").replace(/[ \t]+/g," ").trim().slice(0,limit);
  const normalise=value=>clean(value,2000).toLowerCase()
    .normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
  const maybeReceipt=/\b(?:thank(?:s| you) for (?:applying|submitting your application)|(?:we (?:have )?received|we've received) your application|(?:your )?application (?:has been |was )?(?:received|successfully submitted)|application (?:submission|received) (?:successful|confirmed)|we have your application)\b/i;
  const notReceipt=/\b(?:job alert|job recommendation|newsletter|unsubscribe|invitation to apply|please apply|you can apply|your application (?:was |has been )?(?:rejected|unsuccessful)|unfortunately .*?(?:not selected|unable to proceed))\b/i;
  function analyse({subject="",sender="",body=""}={}){
    const title=clean(subject,250),from=clean(sender,254),message=clean(body,20000);
    const combined=(title+"\n"+message).slice(0,22000);
    const hasReceipt=maybeReceipt.test(combined)&&!notReceipt.test(combined);
    const senderAddress=(from.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i)||[])[0]||"";
    return {
      isLikelyAcknowledgement:hasReceipt,
      senderPresent:!!senderAddress,
      hasMessage:!!message,
      // A pasted sender cannot authenticate its origin. Never call it verified.
      status:hasReceipt?(senderAddress?"possible-acknowledgement":"unverified-sender"):"not-confirmed",
      notice:hasReceipt?
        "Possible submission acknowledgement. Check the sender and job details before attaching; this email has not been independently verified.":
        "No clear application-received acknowledgement was found. Nothing was marked Applied.",
      searchText:normalise(title+"\n"+message)
    };
  }
  function scoreJob(analysis,job){
    if(!analysis?.isLikelyAcknowledgement||!job)return 0;
    const message=" "+analysis.searchText+" ";
    const company=normalise(job.company);
    const title=normalise(job.title);
    if(!company||!title)return 0;
    // Company match is mandatory; generic emails must not match arbitrary jobs.
    const hasCompany=message.includes(" "+company+" ");
    if(!hasCompany)return 0;
    let score=60;
    if(message.includes(" "+title+" "))score+=40;
    else {
      const words=title.split(" ").filter(w=>w.length>=4);
      if(words.length && words.some(w=>message.includes(" "+w+" ")))score+=15;
    }
    return score;
  }
  return Object.freeze({analyse,scoreJob});
});
