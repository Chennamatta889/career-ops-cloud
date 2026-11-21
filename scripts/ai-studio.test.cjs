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
  assert.match(app,/!location\.hash\.startsWith\("#access_token="\)/);
  assert.match(ai,/readUrlSession\(\)/);
  assert.match(ai,/sessionStorage/);
});
test("the private AI function explicitly enforces user email allowlist, auth and consent boundary",()=>{
  assert.match(backend,/getAuthUser\(req\)/);
  assert.match(backend,/ALLOWED_EMAIL/);
  assert.match(backend,/AI_CALLS_ENABLED/);
  assert.match(backend,/GEMINI_API_KEY/);
  assert.match(backend,/user\.email\.trim\(\)\.toLowerCase\(\)!==approved/);
  assert.match(ai,/aiConsent/);
  assert.match(backend,/NEVER invent/);
});
test("the deployed function requires a real Supabase user JWT at the gateway",()=>{
  const configToml=read("supabase/config.toml");
  assert.match(configToml,/verify_jwt\s*=\s*true/);
  assert.match(backend,/getAuthUser\(req\)/);
});
test("GitHub Pages packages AI files but does not ship server files or user data",()=>{
  assert.match(workflow,/cp index\.html styles\.css match-engine\.js careerops-config\.js app\.js ai-studio\.js public\//);
  assert.doesNotMatch(workflow,/cp .*supabase\/functions/);
  assert.match(html,/src="\.\/ai-studio\.js"/);
  assert.match(html,/src="\.\/careerops-config\.js"/);
});
test("diagnostic checks are authenticated, gated and never disclose secret values",()=>{
  assert.match(backend,/const user=await getAuthUser\(req\)/);
  assert.match(backend,/user\.email\.trim\(\)\.toLowerCase\(\)!==approved/);
  assert.match(backend,/body\.action==="status"/);
  assert.match(backend,/missing\.push\("GEMINI_API_KEY"\)/);
  assert.match(backend,/missing\.push\("AI_CALLS_ENABLED"\)/);
  assert.match(backend,/typeof map\?\.default==="string" \? map\.default/);
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
test("AI review does not send applications or persist resume text",()=>{
  assert.doesNotMatch(ai,/localStorage\.setItem\([^\n]*resume/i);
  assert.match(html,/Nothing is submitted automatically/);
  assert.match(ai,/No application will be submitted/);
});
