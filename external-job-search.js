/* Outbound India job searches only; no scraping or automated applications. */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CareerOpsExternalJobs=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const PLACES=Object.freeze({
    india:"India",remote:"Remote, India",hyderabad:"Hyderabad, Telangana, India",
    bengaluru:"Bengaluru, Karnataka, India",mumbai:"Mumbai, Maharashtra, India",
    delhi:"Delhi, India",pune:"Pune, Maharashtra, India",chennai:"Chennai, Tamil Nadu, India"
  });
  function links(query,location){
    const q=String(query==null?"":query).trim().replace(/\s+/g," ").slice(0,120);
    const place=PLACES[String(location||"").toLowerCase()]||"India";
    if(!q)return Object.freeze({
      naukri:"https://www.naukri.com/",
      linkedin:"https://www.linkedin.com/jobs/",
      indeed:"https://in.indeed.com/"
    });
    const keyword=encodeURIComponent(q),where=encodeURIComponent(place);
    return Object.freeze({
      naukri:"https://www.naukri.com/jobs?keyword="+keyword+"&location="+where,
      linkedin:"https://www.linkedin.com/jobs/search/?keywords="+keyword+"&location="+where,
      indeed:"https://in.indeed.com/jobs?q="+keyword+"&l="+where
    });
  }
  return Object.freeze({links});
});
