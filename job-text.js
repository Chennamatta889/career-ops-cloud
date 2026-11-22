/* Career-Ops safe job-description formatting.
 * Converts public ATS rich text to plain, readable paragraphs and bullets.
 * Never renders source HTML as executable markup or fetches external assets.
 * Shared by browser cards, JSON imports, and the scheduled job scanner.
 */
(function (root) {
  "use strict";
  const NAMED = Object.freeze({
    amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",ensp:" ",emsp:" ",
    ndash:"–",mdash:"—",hellip:"…",bull:"•",middot:"·",copy:"©",reg:"®",
    trade:"™",lsquo:"‘",rsquo:"’",ldquo:"“",rdquo:"”",laquo:"«",raquo:"»",
    euro:"€",pound:"£",times:"×",deg:"°",cent:"¢",acute:"´",eacute:"é",
    aacute:"á",egrave:"è",uuml:"ü",rsquor:"’"
  });
  function decodeEntities(value) {
    return value.replace(/&(#(?:x[0-9a-f]{1,8}|[0-9]{1,9})|[a-z][a-z0-9]{1,24});/gi, (whole, entity) => {
      if(entity.charAt(0)==="#"){
        const hex=/^#x/i.test(entity);
        const n=Number.parseInt(entity.slice(hex?2:1),hex?16:10);
        if(!Number.isFinite(n) || n===0 || n>0x10ffff || (n>=0xd800&&n<=0xdfff))return " ";
        if(n===160)return " ";
        if(n<32 && n!==9 && n!==10)return " ";
        return String.fromCodePoint(n);
      }
      return Object.prototype.hasOwnProperty.call(NAMED,entity.toLowerCase())?
        NAMED[entity.toLowerCase()]:whole;
    });
  }
  function plainText(input,limit=6000) {
    if(typeof input!=="string")return "";
    const max=Math.max(1,Math.min(16000,Number.isFinite(limit)?Math.floor(limit):6000));
    let content=input.slice(0,120000).replace(/\r\n?/g,"\n");
    // Some APIs double-encode &lt;p&gt; into &amp;lt;p&amp;gt;.
    for(let i=0;i<3;i++){
      const decoded=decodeEntities(content);
      if(decoded===content)break;
      content=decoded;
    }
    // Support accidentally escaped tags from copied Markdown / JSON sources.
    content=content.replace(/\\(?=<(?:\/?[a-z][\w:-]*\b|!--))/gi,"");
    // Strip active / non-content elements, including their text.
    content=content.replace(/<\s*(script|style|iframe|object|svg|template|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi," ");
    content=content.replace(/<!--[\s\S]*?-->/g," ");
    content=content.replace(/<\s*br\b[^>]*\/?>/gi,"\n");
    content=content.replace(/<\s*li\b[^>]*>/gi,"\n• ");
    content=content.replace(/<\s*\/\s*li\s*>/gi,"\n");
    content=content.replace(/<\s*\/\s*(?:p|div|section|article|ul|ol|h[1-6]|blockquote|table|tr)\s*>/gi,"\n\n");
    content=content.replace(/<\s*(?:p|div|section|article|h[1-6]|blockquote)\b[^>]*>/gi,"\n");
    content=content.replace(/<\s*\/?\s*(?:td|th)\b[^>]*>/gi,"  ");
    // Only remove tags with a real tag name: keep mathematical "< 5" text.
    content=content.replace(/<\s*\/?[a-z][a-z0-9:-]*(?:\s+[^<>]*?)?\s*\/?>/gi,"");
    // Never call innerHTML with untrusted text.
    content=content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g," ");
    content=content.replace(/\u00a0/g," ").replace(/[ \t]+/g," ")
      .replace(/ *\n */g,"\n").replace(/\n{3,}/g,"\n\n").trim();
    return content.slice(0,max).trimEnd();
  }
  /**
   * Extract only explicit experience requirements from employer text.
   * Never guess years from a job title or seniority term.
   */
  function experienceRequirement(input){
    const text=plainText(input,16000);
    if(!text)return null;
    const lines=text.split(/\n/);
    for(const line of lines){
      if(/\b(?:no (?:prior |previous |professional |relevant |work )?experience (?:is )?(?:required|necessary|needed)|freshers? (?:are )?(?:welcome|encouraged|eligible)|(?:welcome|welcoming) freshers?|(?:zero|0)\s+years?\s+(?:of\s+)?experience)\b/i.test(line)){
        return {label:"No experience required",minYears:0};
      }
    }
    // A normalized field from our own scanner is already a requirement.
    const directRange=/^(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*years?$/i.exec(text);
    if(directRange){
      const low=Number(directRange[1]),high=Number(directRange[2]);
      if(low<=high&&high<=40)return {label:low+"–"+high+" years",minYears:low};
    }
    const directSingle=/^(\d{1,2})(\+)?\s*years?$/i.exec(text);
    if(directSingle&&Number(directSingle[1])<=40){
      const low=Number(directSingle[1]);
      return {label:low+(directSingle[2]?"+":"")+" years",minYears:low};
    }
    const range=/\b(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\s*(?:years?|yrs?)\b/gi;
    const single=/\b(\d{1,2})\s*(\+)?\s*(?:years?|yrs?)\b/gi;
    const credible=function(line,start,end){
      // Prevent "20 years in business" from being treated as job experience.
      const context=line.slice(Math.max(0,start-110),Math.min(line.length,end+105)).toLowerCase();
      return /\b(?:experience|experienced|professional|hands.on|relevant|qualification|requirement|working with|working in|expertise|development|engineering|practice)\b/.test(context);
    };
    for(const line of lines){
      for(const found of line.matchAll(range)){
        const low=Number(found[1]),high=Number(found[2]);
        if(low<=high && high<=40 && credible(line,found.index,found.index+found[0].length)){
          return {label:low+"–"+high+" years",minYears:low};
        }
      }
      for(const found of line.matchAll(single)){
        const low=Number(found[1]);
        if(low>40||!credible(line,found.index,found.index+found[0].length))continue;
        const context=line.slice(Math.max(0,found.index-40),found.index).toLowerCase();
        const minimum=Boolean(found[2])||/\b(?:at least|minimum(?: of)?|a minimum of|over|more than)\s*$/.test(context);
        return {label:low+(minimum?"+":"")+" years",minYears:low};
      }
    }
    return null;
  }
  // Filter by an employer's minimum requirement, not the visitor's own years.
  function experienceMatches(requirement,selected){
    if(!selected)return true;
    const result=experienceRequirement(requirement);
    if(selected==="unspecified")return !result;
    if(!result)return false;
    const minimum=result.minYears;
    if(selected==="fresher")return minimum===0;
    if(selected==="1-2")return minimum>=1&&minimum<=2;
    if(selected==="3-5")return minimum>=3&&minimum<=5;
    if(selected==="6-9")return minimum>=6&&minimum<=9;
    if(selected==="10+")return minimum>=10;
    return true;
  }
  /**
   * Evidence-based fresher / early-career discovery. A role title alone
   * suggests an audience, not a confirmed zero-year hiring requirement.
   * Never label senior or explicitly 3+ year roles as fresher openings.
   */
  function entryOpportunity(job){
    const title=typeof job?.title==="string"?job.title:"";
    const explicit=experienceRequirement(job?.requiredExperience)||
      experienceRequirement(job?.description);
    const minYears=explicit?.minYears;
    const senior=/\b(?:senior|staff|principal|director|lead|manager|supervisor|team[ -]?(?:lead|leader)|architect|head|vice[ -]president|vp|svp|evp|avp|agm|dgm|gm|tl|sr\.?|expert)\b/i.test(title);
    const fresherTitle=/\b(?:intern(?:ship)?|apprentice(?:ship)?|trainee|freshers?|new[ -]?grad(?:uate)?s?|graduate[ -](?:engineer|trainee|program(?:me)?|associate|hire|intern|analyst)|campus[ -](?:graduate|hire|recruit(?:ment)?)|entry[ -]?level)\b/i.test(title);
    const earlyTitle=/\b(?:junior|associate[ -](?:software|engineer|developer|analyst|consultant)|(?:software[ -])?engineer[ -]?(?:i|1)|analyst[ -]?(?:i|1))\b/i.test(title);
    if(senior||minYears>2)return {level:"unknown",basis:"",minYears:minYears??null};
    if(minYears===0)return {level:"fresher",basis:"explicit",minYears:0};
    if(fresherTitle&&minYears==null)return {level:"early",basis:"title",minYears:null};
    if(fresherTitle&&minYears===1)return {level:"early",basis:"title",minYears:1};
    if(minYears>=1&&minYears<=2)return {level:"early",basis:"explicit",minYears};
    if(earlyTitle&&minYears==null)return {level:"early",basis:"title",minYears:null};
    return {level:"unknown",basis:"",minYears:minYears??null};
  }
  const api=Object.freeze({plainText,decodeEntities,experienceRequirement,experienceMatches,entryOpportunity});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.CareerOpsJobText=api;
})(typeof globalThis!=="undefined"?globalThis:this);
