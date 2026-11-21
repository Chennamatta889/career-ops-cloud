/* India-only geographic scope for the published feed and Discover Jobs.
 * Conservative by design: unknown and globally remote locations are excluded.
 * This module contains location labels only; it never reads descriptions,
 * employer names, user profiles, or personal information.
 */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.CareerOpsIndiaJobs=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const CITIES=[
    "hyderabad","secunderabad","bengaluru","bangalore","mumbai","navi mumbai",
    "delhi","new delhi","pune","chennai","noida","greater noida",
    "gurugram","gurgaon","kolkata","calcutta","ahmedabad","kochi","cochin",
    "thiruvananthapuram","trivandrum","jaipur","chandigarh","bhubaneswar",
    "indore","lucknow","vadodara","surat","visakhapatnam","vizag",
    "vijayawada","nagpur","mysuru","mysore","gandhinagar","mangaluru",
    "mangalore","coimbatore","dehradun","mohali","bhopal","thane",
    "ghaziabad","faridabad","patna","ranchi","guwahati","jamshedpur",
    "hubli","belgaum","belagavi","tiruchirappalli","trichy","madurai",
    "warangal","guntur","tirupati","nellore","rajkot","jodhpur","goa"
  ];
  const REGIONS=[
    "telangana","andhra pradesh","karnataka","maharashtra","tamil nadu",
    "uttar pradesh","west bengal","gujarat","kerala","rajasthan",
    "odisha","orissa","madhya pradesh","haryana","punjab","uttarakhand",
    "chhattisgarh","assam","bihar","jharkhand","himachal pradesh",
    "national capital region"
  ];
  const OUTSIDE=/\b(?:usa|united states|united kingdom|canada|australia|germany|ireland|france|singapore|netherlands|uae|united arab emirates|dubai|japan|malaysia|philippines|hong kong|new zealand|south africa|indonesia|vietnam|brazil|mexico|poland|sweden|switzerland|spain|italy|portugal|israel|taiwan)\b/;
  function normal(value){
    return typeof value==="string"?
      value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim():"";
  }
  const PLACE_NAMES=[...CITIES,...REGIONS].map(normal);
  function hasPhrase(haystack,phrase){
    return (" "+haystack+" ").includes(" "+phrase+" ");
  }
  function isIndiaLocation(value){
    const place=normal(value);
    if(!place)return false;
    if(hasPhrase(place,"india")||place==="in")return true;
    // A city's name in an overseas address does not establish Indian eligibility.
    if(OUTSIDE.test(place))return false;
    return PLACE_NAMES.some(name=>hasPhrase(place,name));
  }
  return Object.freeze({isIndiaLocation,market:"IN"});
});
