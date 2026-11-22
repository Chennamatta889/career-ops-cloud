/* Counts only roles actually present in the final, deduplicated published feed.
 * Technology mentions in descriptions do not establish a job's primary role.
 */
"use strict";
const {experienceRequirement}=require("../job-text.js");
const GROUPS=Object.freeze({
  dotnet:/(?:\.\s*net\b|\bdot\s*net\b|\basp\s*net\b|\bc\s*#|\bcsharp\b)/i,
  java:/\b(?:java|j2ee|spring[ -]?boot)\b/i,
  testing:/\b(?:qa|quality assurance|quality analyst|sdet|software test(?:er|ing)?|manual test(?:er|ing)?|automation test(?:er|ing)?|test engineer|selenium|playwright|cypress)\b/i
});
function measureRoleCoverage(jobs){
  const groups=Object.fromEntries(Object.keys(GROUPS).map(key=>[key,{
    jobs:0,explicit_experience:0,experience_unspecified:0,zero_experience:0,
    fresher_to_two_years:0,three_to_five_years:0,six_plus_years:0
  }]));
  for(const job of jobs){
    const title=String(job?.title||"");
    const dept=String(job?.department||"");
    const skills=Array.isArray(job?.skills)?job.skills.join(" "):"";
    const heading=title+" "+dept;
    const requirement=experienceRequirement(job?.requiredExperience)||
      experienceRequirement(job?.description);
    for(const [key,pattern] of Object.entries(GROUPS)){
      // Do not count a Salesforce role merely because its description mentions Java.
      if(!pattern.test(heading)&&!pattern.test(skills))continue;
      const row=groups[key];row.jobs++;
      if(!requirement){row.experience_unspecified++;continue;}
      row.explicit_experience++;
      if(requirement.minYears===0)row.zero_experience++;
      if(requirement.minYears<=2)row.fresher_to_two_years++;
      else if(requirement.minYears<=5)row.three_to_five_years++;
      else row.six_plus_years++;
    }
  }
  return groups;
}
module.exports={measureRoleCoverage};
