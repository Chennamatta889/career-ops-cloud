const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.resolve(__dirname,"..",p),"utf8");
const html=read("index.html");
const app=read("app.js");
const ai=read("ai-studio.js");
const config=read("careerops-config.js");
const backend=read("supabase/functions/careerops-ai-review/index.ts");
const workflow=read(".github/workflows/deploy-ui.yml");

test("AI Studio controls exist and are connected to its navigation",()=>{
  const ids=[...new Set([...ai.matchAll(/byId\("([a-zA-Z0-9]+)"\)/g)].map(m=>m[1]))];
  assert.ok(ids.length>=13);
  for(const id of ids)assert.match(html,new RegExp('id="'+id+'"'),"Missing "+id);
  assert.match(html,/data-nav="ai"/);
  assert.match(app,/ai:"AI Studio"/);
  assert.match(app,/data-action="ai"/);
});
test("only browser-safe values for the dedicated Career-Ops project are published",()=>{
  assert.match(config,/supabaseUrl: "https:\/\/nnhzihcugvifhegsfmua\.supabase\.co"/);
  assert.match(config,/publishableKey: "sb_publishable_[A-Za-z0-9_-]+"/);
  assert.doesNotMatch(config,/eyJhbG|sb_secret_|service_role|sk-[A-Za-z0-9]{12}|AIza[A-Za-z0-9_-]{15}/);
  assert.match(ai,/if\(!ready\)/);
});
test("the app preserves auth callback URL fragment until the AI tab reads it",()=>{
  assert.match(app,/access_token=\|error=\|error_code=/);
  assert.match(ai,/readUrlSession\(\)/);
  assert.match(ai,/sessionStorage/);
});
test("the AI endpoint accepts verified accounts while preserving Supabase JWT authentication and consent",()=>{
  assert.match(backend,/getAuthUser\(req\)/);
  assert.match(backend,/user\.email_confirmed_at/);
  assert.doesNotMatch(backend,/ALLOWED_EMAIL|EMAIL_NOT_ALLOWED|ALLOWLIST_SETUP_REQUIRED/);
  assert.match(backend,/reserveAiQuota\(user.id\)/);
  assert.match(backend,/AI_CALLS_ENABLED/);
  assert.match(backend,/GEMINI_API_KEY/);
  assert.match(ai,/aiConsent/);
  assert.match(backend,/NEVER invent/);
});
test("the deployed function requires a real Supabase user JWT at the gateway",()=>{
  const configToml=read("supabase/config.toml");
  assert.match(configToml,/verify_jwt\s*=\s*true/);
  assert.match(backend,/getAuthUser\(req\)/);
});
test("GitHub Pages packages AI files but does not ship server files or user data",()=>{
  assert.match(workflow,/cp index\.html styles\.css match-engine\.js careerops-config\.js app\.js resume-parser\.js ai-studio\.js private-workspace\.js health-check\.js public\//);
  assert.doesNotMatch(workflow,/cp .*supabase\/functions/);
  assert.match(html,/src="\.\/ai-studio\.js"/);
  assert.match(html,/src="\.\/careerops-config\.js"/);
});
test("diagnostic checks are authenticated, gated and never disclose secret values",()=>{
  assert.match(backend,/const user=await getAuthUser\(req\)/);
  assert.match(backend,/user\.email_confirmed_at/);
  assert.match(backend,/body\.action==="status"/);
  assert.match(backend,/missing\.push\("GEMINI_API_KEY"\)/);
  assert.match(backend,/missing\.push\("AI_CALLS_ENABLED"\)/);
  assert.match(backend,/typeof map\?\.default==="string" \? map\.default/);
});
test("unrestricted verified-email sign-in is protected by durable shared and per-user AI quotas",()=>{
  const quota=read("supabase/migrations/20261121_phase4_verified_multiuser_ai_quota.sql");
  assert.match(backend,/daily_user_limit:DAILY_USER_QUOTA/);
  assert.match(backend,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(backend,/code:"EMAIL_UNVERIFIED"/);
  assert.match(backend,/code:"QUOTA_SERVICE_UNAVAILABLE"/);
  assert.match(backend,/code:global\?"GLOBAL_DAILY_LIMIT":"USER_DAILY_LIMIT"/);
  assert.match(backend,/let quota:/);
  assert.match(backend,/quota=await reserveAiQuota\(user.id\)/);
  assert.ok(backend.indexOf("quota=await reserveAiQuota(user.id)") <
    backend.indexOf('const api=await fetch("https://generativelanguage.googleapis.com'));
  assert.match(quota,/pg_advisory_xact_lock/);
  assert.match(quota,/per_user_limit constant integer := 2/);
  assert.match(quota,/global_limit constant integer := 20/);
  assert.match(quota,/grant execute on function public.careerops_reserve_ai_review\(uuid\) to service_role/);
  assert.match(quota,/revoke all on function public.careerops_reserve_ai_review\(uuid\)/);
});
test("AI Studio explains missing resume, description and consent, and probes backend",()=>{
  for(const id of ["aiResumeCount","aiJdCount","aiChecklist","aiCheckConnection"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(ai,/action:"status"/);
  assert.match(ai,/before reviewing/i);
  assert.match(ai,/checkReviewConnection\(token\)/);
});
test("failed Gemini calls do not lock the user out for 60 seconds",()=>{
  const fetchIndex=backend.indexOf('const api=await fetch("https://generativelanguage.googleapis.com');
  const successIndex=backend.indexOf('recent.set(user.id,Date.now())');
  assert.ok(fetchIndex>=0&&successIndex>fetchIndex,"Cooldown must only be set after provider succeeds");
  assert.match(backend,/inFlight\.delete\(user\.id\)/);
  assert.match(backend,/PROVIDER_TIMEOUT_MS\s*=\s*100_000/);
  assert.match(backend,/AbortSignal\.timeout\(PROVIDER_TIMEOUT_MS\)/);
  assert.doesNotMatch(backend,/AbortSignal\.timeout\(42000\)/);
  assert.match(backend,/code:"PROVIDER_TIMEOUT"/);
});
test("AI Review uses fast default Gemini and shows request progress",()=>{
  assert.match(backend,/gemini-3\.5-flash-lite/);
  assert.match(backend,/thinkingConfig=\{thinkingLevel:"low"\}/);
  assert.match(ai,/setInterval\(showProgress,1000\)/);
  assert.match(ai,/clearInterval\(progressTimer\)/);
});
test("PDF/DOCX extraction and ATS source fetching are wired to AI Studio",()=>{
  const parser=read("resume-parser.js");
  const jobSource=read("supabase/functions/careerops-ai-review/job-fetch.mjs");
  for(const id of ["aiResumeTxtFile","aiResumeParseStatus","aiJobUrl","aiFetchJob","aiJobFetchStatus"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/src="\.\/resume-parser\.js"/);
  assert.match(parser,/extractRawText/);
  assert.match(parser,/pdf\.min\.mjs/);
  assert.match(ai,/action:"fetch_job"/);
  assert.match(backend,/body\.action==="fetch_job"/);
  assert.match(jobSource,/SUPPORTED|UNSUPPORTED_JOB_LINK/i);
  assert.match(workflow,/pdfjs-dist@5\.4\.624 mammoth@1\.11\.0/);
  assert.match(workflow,/public\/vendor\/pdf\.min\.mjs/);
  assert.match(workflow,/public\/vendor\/mammoth\.browser\.min\.js/);
});
test("Google Sign-In is primary with an email-link fallback and no client secret",()=>{
  assert.match(html,/id="aiGoogleSignIn"/);
  assert.match(html,/Continue with Google/);
  assert.match(html,/class="ai-email-fallback"/);
  assert.match(ai,/\/auth\/v1\/authorize/);
  assert.match(ai,/url\.searchParams\.set\("provider","google"\)/);
  assert.match(ai,/url\.searchParams\.set\("redirect_to",siteRedirect\)/);
  assert.match(ai,/location\.origin !== siteOrigin/);
  assert.doesNotMatch(read("careerops-config.js"),/client_secret|google_client_secret|AIza[A-Za-z0-9_-]{15}/i);
});
test("AI review does not send applications or persist resume text",()=>{
  assert.doesNotMatch(ai,/localStorage\.setItem\([^\n]*resume/i);
  assert.match(html,/Nothing is submitted automatically/);
  assert.match(ai,/No application will be submitted/);
});
