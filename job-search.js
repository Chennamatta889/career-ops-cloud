/* Career-Ops job discovery relevance.
 * The default search intentionally does not match incidental description text.
 * Full-description search is a separate, explicit visitor choice.
 */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CareerOpsJobSearch=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  function normalize(value){
    return String(value==null?"":value).normalize("NFKC").toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim()
      // Treat well-known joined technology brands and their spaced forms equally.
      .replace(/\bservice now\b/g,"servicenow")
      .replace(/\bsales force\b/g,"salesforce");
  }
  const containsTerm=(value,term)=>Boolean(value&&(" "+value+" ").includes(" "+term+" "));
  function evaluate(job,query,{includeDescription=false}={}){
    const search=normalize(query);
    if(!search)return {matches:true,score:0,source:"all"};
    const terms=search.split(" ").filter(Boolean);
    const fields=[
      ["title",normalize(job?.title),120],
      ["skills",normalize(Array.isArray(job?.skills)?job.skills.join(" "):""),100],
      ["department",normalize(job?.department),80],
      ["company",normalize(job?.company),70],
      ["location",normalize(job?.location),55]
    ];
    if(includeDescription)fields.push(["description",normalize(job?.description),8]);
    let points=0,mainHits=0;
    for(const term of terms){
      let best=0,bestSource="";
      for(const [source,text,weight] of fields){
        if(containsTerm(text,term) && weight>best){best=weight;bestSource=source;}
      }
      if(!best)return {matches:false,score:0,source:"none"};
      points+=best;
      if(bestSource!=="description")mainHits++;
    }
    // Exact job-role phrases outrank broad company or description mentions.
    if(containsTerm(fields[0][1],search))points+=180;
    else if(containsTerm(fields[1][1],search))points+=100;
    else if(containsTerm(fields[2][1],search))points+=70;
    else if(containsTerm(fields[3][1],search))points+=65;
    if(mainHits===terms.length)points+=30;
    return {matches:true,score:points,source:mainHits===terms.length?"primary":"description"};
  }
  return Object.freeze({normalize,evaluate});
});
