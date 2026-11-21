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
  const api=Object.freeze({plainText,decodeEntities});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.CareerOpsJobText=api;
})(typeof globalThis!=="undefined"?globalThis:this);
