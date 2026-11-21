/**
 * Career-Ops public ATS job-description loader.
 * Never fetch arbitrary URLs. Only official published Greenhouse, Ashby
 * and Lever posting APIs, using validated board/job IDs and no redirects.
 * Does not submit forms, bypass logins, or send a resume anywhere.
 */
const BOARD = /^[a-zA-Z0-9_-]{1,90}$/;
const POST = /^[a-zA-Z0-9_-]{3,110}$/;
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_DESCRIPTION = 16000;

export function parseJobLink(raw) {
  if (typeof raw !== "string" || raw.length < 12 || raw.length > 1500) return null;
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.some(p => /%|[^\w-]/.test(p))) return null;
  if (["job-boards.greenhouse.io", "boards.greenhouse.io", "boards.eu.greenhouse.io", "job-boards.eu.greenhouse.io"].includes(host)
      && parts.length === 3 && BOARD.test(parts[0]) && parts[1] === "jobs" && /^[0-9]{3,18}$/.test(parts[2])) {
    return {
      provider: "greenhouse", board: parts[0], post: parts[2],
      api: "https://boards-api.greenhouse.io/v1/boards/" + parts[0] + "/jobs/" + parts[2],
      postingUrl: u.origin + u.pathname
    };
  }
  if (host === "jobs.ashbyhq.com" && parts.length >= 2 && parts.length <= 3
      && BOARD.test(parts[0]) && POST.test(parts[1])) {
    return {
      provider: "ashby", board: parts[0], post: parts[1],
      api: "https://api.ashbyhq.com/posting-api/job-board/" + parts[0],
      postingUrl: u.origin + "/" + parts[0] + "/" + parts[1]
    };
  }
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(host)
      && parts.length === 2 && BOARD.test(parts[0]) && POST.test(parts[1])) {
    const apiHost = host === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
    return {
      provider: "lever", board: parts[0], post: parts[1],
      api: "https://" + apiHost + "/v0/postings/" + parts[0] + "/" + parts[1],
      postingUrl: u.origin + u.pathname
    };
  }
  return null;
}
function decodeEntities(s) {
  return s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27|#34|#x22|#x2f|#47);/gi, a => {
    const x=a.toLowerCase();
    return ({ "&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'","&nbsp;":" ","&#39;":"'","&#x27;":"'","&#34;":'"',"&#x22;":'"',"&#x2f;":"/","&#47;":"/" })[x] || " ";
  });
}
export function plainText(s) {
  if (typeof s !== "string") return "";
  return decodeEntities(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<\/(?:p|li|h[1-6]|div|section|ul|ol)>/gi,"\n")
    .replace(/<br\b[^>]*\/?>/gi,"\n")
    .replace(/<[^>]*>/g," ")
    .replace(/\r\n?/g,"\n")
    .replace(/[^\S\n]+/g," ")
    .replace(/\n[ \t]+/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim()).slice(0,MAX_DESCRIPTION);
}
export function jobFromPayload(link, data) {
  if (!link || !data || typeof data !== "object") return null;
  let j = data;
  if (link.provider === "ashby") {
    if (!Array.isArray(data.jobs)) return null;
    j = data.jobs.find(v => {
      if (!v || v.isListed === false) return false;
      const id=String(v.id || "").toLowerCase();
      const url=String(v.jobUrl || v.applyUrl || "");
      const parsed=parseJobLink(url);
      return id===link.post.toLowerCase() || (parsed && parsed.provider==="ashby" &&
        parsed.board.toLowerCase()===link.board.toLowerCase() &&
        parsed.post.toLowerCase()===link.post.toLowerCase());
    });
    if (!j) return null;
  }
  if (link.provider === "greenhouse" && String(j.id) !== link.post) return null;
  if (link.provider === "lever" && String(j.id || "").toLowerCase() !== link.post.toLowerCase()) return null;
  const html=link.provider==="greenhouse" ? j.content
    : link.provider==="ashby" ? (j.descriptionPlain || j.descriptionHtml)
    : (j.descriptionPlain || j.description || "");
  const leverLists=link.provider==="lever" && Array.isArray(j.lists)
    ? j.lists.map(p => [p.text,p.content].filter(Boolean).join("\n")).join("\n")
    : "";
  const extra=link.provider==="lever" ? (j.additionalPlain || j.additional || "") : "";
  const description=plainText([html,leverLists,extra].filter(Boolean).join("\n\n"));
  if (description.length < 120) return null;
  const title=String(j.title || j.text || "").trim().slice(0,160);
  if (!title) return null;
  const company=link.board.replace(/[-_]/g," ").slice(0,120);
  const location=String(
    link.provider==="greenhouse" ? (j.location?.name || "") :
    link.provider==="lever" ? (j.categories?.location || "") :
    (j.location || j.locationName || "")
  ).slice(0,160);
  return {provider:link.provider,title,company,location,description,sourceUrl:link.postingUrl,characters:description.length};
}
async function cappedJson(response) {
  const len=Number(response.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("Employer board is too large to import automatically.");
  const reader=response.body?.getReader();
  if (!reader) throw new Error("Employer API did not return a readable response.");
  let total=0;
  const parts=[];
  try {
    while (true) {
      const {value,done}=await reader.read();
      if (done) break;
      total+=value.byteLength;
      if (total > MAX_BYTES) throw new Error("Employer board response exceeded the safe size limit.");
      parts.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(total);let pos=0;
  for (const part of parts) {bytes.set(part,pos);pos+=part.byteLength;}
  let json;
  try {json=JSON.parse(new TextDecoder().decode(bytes));}
  catch {throw new Error("Employer API did not return valid posting data.");}
  return json;
}
export async function fetchPublicJob(raw, fetchImpl=fetch) {
  const link=parseJobLink(raw);
  if (!link) {
    const error=new Error("Supported employer links: Greenhouse, Ashby, or Lever only. Other websites require manual job-description paste.");
    error.code="UNSUPPORTED_JOB_LINK";throw error;
  }
  let resp;
  try {
    resp=await fetchImpl(link.api,{
      method:"GET",redirect:"error",headers:{"Accept":"application/json"},
      signal:AbortSignal.timeout(22000)
    });
  }catch {
    const error=new Error("Employer's public job API is unavailable or timed out. Try pasting the job description.");
    error.code="JOB_SOURCE_UNAVAILABLE";throw error;
  }
  if(resp.status===404) {
    const error=new Error("This job is no longer available in the employer's public board.");
    error.code="JOB_NOT_FOUND";throw error;
  }
  if(!resp.ok) {
    const error=new Error("Employer's job service returned HTTP "+resp.status+". Paste the job description instead.");
    error.code="JOB_SOURCE_UNAVAILABLE";throw error;
  }
  const payload=await cappedJson(resp);
  const job=jobFromPayload(link,payload);
  if(!job) {
    const error=new Error("Could not identify a current full description for that posting. You can still paste it manually.");
    error.code="JOB_DETAILS_MISSING";throw error;
  }
  return job;
}
