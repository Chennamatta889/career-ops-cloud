/* Phase 10B — official company career portals, never fabricated vacancies.
 * This UI never writes application status or communicates with candidate APIs.
 */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root){
    root.CareerOpsEnterpriseCareers=api;
    const boot=()=>api.init(root.document);
    if(root.document?.readyState==="loading")root.document.addEventListener("DOMContentLoaded",boot);
    else boot();
  }
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const officialHosts=Object.freeze({
    tcs:"www.tcs.com",
    accenture:"www.accenture.com",
    wipro:"careers.wipro.com",
    infosys:"www.infosys.com",
    ibm:"www.ibm.com",
    capgemini:"careers.capgemini.com",
    google:"www.google.com",
    microsoft:"careers.microsoft.com",
    amazon:"www.amazon.jobs",
    oracle:"careers.oracle.com",
    adobe:"careers.adobe.com",
    servicenow:"careers.servicenow.com",
    atlassian:"www.atlassian.com"
  });
  function isOfficial(entry){
    if(!entry || !Object.prototype.hasOwnProperty.call(officialHosts,entry.id) ||
      entry.method!=="official_portal" || !["IT services","Product companies"].includes(entry.group))return false;
    try{
      const u=new URL(entry.url);
      return u.protocol==="https:"&&u.hostname===officialHosts[entry.id]&&!u.username&&!u.password;
    }catch(_){return false;}
  }
  function select(companies,keyword="",group=""){
    const q=String(keyword||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    return (Array.isArray(companies)?companies:[]).filter(isOfficial).filter(company=>
      (!group||company.group===group) &&
      (!q||[company.name,company.group,company.location,company.id].join(" ")
        .toLowerCase().replace(/[^a-z0-9]+/g," ").includes(q)));
  }
  function init(document){
    const cards=document?.getElementById("enterpriseCareerCards");
    if(!cards)return;
    const status=document.getElementById("enterpriseCareerStatus");
    const search=document.getElementById("enterpriseCareerSearch");
    const kind=document.getElementById("enterpriseCareerKind");
    let entries=[];
    const draw=()=>{
      cards.replaceChildren();
      const visible=select(entries,search.value,kind.value);
      for(const company of visible){
        const article=document.createElement("article");
        article.className="enterprise-career-card";
        const name=document.createElement("strong");name.textContent=company.name;
        const note=document.createElement("p");
        note.textContent=company.group+" · "+company.location;
        const availability=document.createElement("p");
        availability.className="enterprise-career-note";
        availability.textContent="Official employer portal — individual jobs are not imported from this link.";
        const anchor=document.createElement("a");
        anchor.className="text-link";
        anchor.href=company.url;
        anchor.target="_blank";
        anchor.rel="noopener noreferrer";
        anchor.textContent="Browse official jobs ↗";
        article.append(name,note,availability,anchor);
        cards.appendChild(article);
      }
      if(!visible.length)status.textContent="No company portals match. Try a different company name or type.";
      else status.textContent="Showing "+visible.length+" of "+entries.length+
        " official career portals. Links are not individual job postings.";
    };
    search.addEventListener("input",draw);
    kind.addEventListener("change",draw);
    const request=typeof fetch==="function"?fetch:null;
    if(!request){status.textContent="Company directory unavailable in this browser.";return;}
    request("./data/enterprise-careers.json",{cache:"no-store"}).then(async response=>{
      if(!response.ok)throw Error("Company directory unavailable");
      const data=await response.json();
      if(data.schema!=="careerops.enterprise-careers.v1"||!Array.isArray(data.companies)||
        data.companies.length!==13||!data.companies.every(isOfficial))
        throw Error("Invalid official company directory");
      const ids=new Set(data.companies.map(x=>x.id));
      if(ids.size!==13)throw Error("Duplicate company directory entry");
      entries=data.companies;
      draw();
    }).catch(()=>{
      status.textContent="Official career links could not be loaded. Try again later.";
    });
  }
  return Object.freeze({officialHosts,isOfficial,select,init});
});
