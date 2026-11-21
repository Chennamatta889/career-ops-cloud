# Career-Ops Cloud Sandbox


## Phases 08, 09 and 10 — Reliability, Email Evidence and Source Freshness (November 21, 2026)

**Phase 08 — reliability and live QA:** The desktop/mobile dashboard retains its existing stages, job-search filters, signed-in account isolation and one-click application-confirmation flow. A new independent "Phase 08 real-browser website QA" GitHub Actions workflow uses Chromium against public GitHub Pages. It tests cards, filters, a synthetic guest-only job, the Not yet / Yes, I applied flow, email review without auto-apply, and mobile overflow. It never signs in, accesses a real user's account or submits to employers. CI and public smoke tests cannot fully replace manual sign-in/device checks.

**Phase 09 — acknowledgement review (opt-in):** My applications has a collapsed "Review a Gmail application acknowledgement" area. Users copy sender, subject and relevant text from Gmail. The application-email.js module analyses text inside their browser. A possible receipt needs explicit submitted/received language, a sender and the selected employer's name. The user chooses a tracked job and selects "Attach reviewed note". Only a review timestamp is saved in that browser's session; email sender, subject and message body are neither stored nor transmitted. This does not mark the job Applied: the user must still choose "Yes, I applied". Direct Gmail OAuth, automatic inbox scanning and cryptographic sender verification are NOT included.

**Phase 10 — expanded sources and freshness:** Three public Ashby ATS boards (Ashby, Ramp, Linear) were added. The daily scanner emits privacy-safe source_health per employer board. An older saved job missing after a successful board scan is labeled "Not in latest employer feed". When that board could not be reached, the card shows "Employer board unavailable"; neither label definitively establishes vacancy closure. Tracked applications are never deleted automatically. The guard-public-feed.mjs script blocks deployment of empty or severely degraded job feeds and preserves the previous published release. Sources remain a selected subset of public Greenhouse and Ashby boards.

**Protected:** No employer applications, Gmail mailbox permissions, private resume uploads, or additional Supabase database migrations were introduced. AdSense, Search Console verification, Google OAuth, privacy/legal pages, portfolio and DraftflowAI remain covered by the release gates.


## Universal IT and Non-IT Job Discovery (November 21, 2026)

The website now **collects all published job titles** from its selected public Greenhouse and Ashby employer boards. It no longer filters jobs at the scanner by DevOps/Cloud/SRE keywords, seniority, years of experience, or country. Source catalog: `scripts/universal-job-sources.json`, currently **57 verified public employer boards** spanning IT, marketing, customer support, finance, HR, sales, retail, education, manufacturing, healthcare, logistics and hospitality. Scan implementation: `scripts/universal-job-scan.mjs`.

**Scope limitation:** This is not a search of *every* job on the internet. The scanner publishes **all unique public postings returned by the configured Greenhouse/Ashby employer boards**, without a fixed 500-job ceiling. Employer boards are a selected subset of global employers and some sources can be temporarily unavailable. The all-role scanner uses category round-robin ordering so high-volume technology employers do not conceal other job sectors. The Discover page shows job cards without public listing totals, initially loads a small render batch, and progressively reveals additional cards on scroll (with a manual Show more fallback). Full public results remain searchable. Browser session storage keeps personal tracking records rather than duplicating the entire public feed.

**User controls:** Discover Jobs now offers an explicit **All IT + non-IT / IT / Non-IT** selector, a 13-category menu, keyword search, location filters, and newest-first sorting. Optional personal role/skills/location preferences influence local priority ranking **only when deliberately used**; they do not determine which jobs the scanner collects. New users start with blank preferences; existing users retain theirs without removing any non-IT jobs from the feed. `job-categories.js` assigns approximate browse labels based on titles and department text; an unusual role may be placed in "Other", never excluded by category inference. Use an actual job URL and full description to confirm requirements.

**Availability:** CI tests sector classification, senior/manager/intern inclusion, India and overseas locations, source validation, no private-data leakage, deduplication and category balancing; live smoke test verifies the public artifact and anonymous AI access denial. See GitHub Actions deployment for current job counts and category distribution. Public job APIs are supplied by Greenhouse and Ashby; other job portals (including Workday and Naukri) are not automatically indexed in this release.


## Phase 4.5 — Stability, security, and read-only diagnostics (November 21, 2026)

### Included fixes

- **Account separation:** Browser job records are now session-scoped by the active Google account, rather than automatically showing the old browser-wide localStorage data. On sign-out or account change, the dashboard switches to that account's own session records and restores only its own RLS-protected server data. A network job feed still running for an earlier account cannot overwrite the next account's data.
- **Legacy tracking migration:** The Applications page's **Upload this device's saved jobs** action explicitly asks permission before importing old unassigned browser records. Users should not import legacy jobs from another person's shared device. Old unassigned job data is cleared only after successful confirmed upload.
- **Tracking consistency:** Manually added jobs now send a canonical job key with every stage change (including unsaving), preventing mismatched cloud keys for new records.
- **Async safety:** An in-flight resume-vault fetch is invalidated when a user signs out or switches accounts, including during response JSON parsing. Restoring a saved resume won't overwrite text entered while loading; manual Load confirms before replacing an existing editor. Google auth responses from an older sign-in cannot restore stale private UI after logout.
- **Job description freshness:** Clicking AI review on a supported Ashby, Lever or Greenhouse job now attempts to retrieve the full public description even when the public scan already contains a long excerpt. A job-fetch response cannot overwrite a different link or a description the user edited while it was loading. Unsupported or unavailable portals still allow manual paste.
- **Error handling:** Clearer signed-out, diagnostic, parser and private storage messages; no automatic applications or paid background Gemini checks.

### Diagnostics and release gates

Open **Settings & data → System diagnostics → Run diagnostics**. The checks are read-only: public scanner feed schema, PDF/DOCX parser bundle assets, Google provider status, verified user session, owner-only resume vault query (metadata only), owner-only tracking query (metadata only), and AI configuration. **No Gemini generation, recruiter email or job application is triggered**. The AI diagnostic verifies configuration, not a successful paid generation; scanned PDF OCR remains unavailable.

The GitHub Actions **Publish Career-Ops dashboard** workflow now runs browser regression tests for account switching, unassigned legacy data, canonical job keys, stale public feed requests, login, PDF/DOCX parser handling and AI review wiring, plus a post-deploy public website smoke test. The live smoke checks published JS/HTML and parser assets and verifies an unauthenticated request to the AI endpoint is denied. A real per-user Google login, PDF parsing on the user's phone and successful Gemini response still require explicit signed-in tests using the browser; do not mark those completed based only on mocked tests.

### Security note

Supabase schema and quota RLS checks were audited. User-owned vault/tracking tables have RLS and anonymous read denied. The Gemini quota reservation function remains service-role only. Supabase's existing **Leaked Password Protection Disabled** advisory applies if password sign-in is enabled; see https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Project owners can enable the setting in Supabase without exposing credentials in code.

## Verified multi-user access (November 21, 2026)

Career-Ops no longer enforces a single-email ALLOWED_EMAIL allowlist. Any verified Supabase Auth account may fetch public supported employer job descriptions and request an AI Review. The Edge Function checks the authenticated user's email confirmation status. Existing Row Level Security isolates each user's private resume and application tracking records.

AI Review attempts are restricted to **2 per account per UTC day** and **20 per UTC day across the project**. A service-role-only database RPC reserves usage atomically before each Gemini request. Failed provider requests count; if quota validation is unavailable, the function makes no provider call. The service role key never enters the public website. These are limits on provider requests, not a guarantee of zero charges; verify provider billing caps.

If Google Cloud OAuth **Audience** remains External + **Testing**, Google itself restricts sign-in to test users. Switch to **In production** to permit other Google accounts, subject to Google's verification requirements. The GitHub Pages public website itself cannot change this console setting.

Schema: supabase/migrations/20261121_phase4_verified_multiuser_ai_quota.sql.


A standalone experiment running the original [Career-Ops](https://github.com/career-ops-hq/career-ops) scanner through GitHub Actions, plus a responsive **Career-Ops job-search dashboard** with a DraftflowAI-inspired style. This repository remains independent from DraftflowAI: no code, accounts, credentials, secrets, resumes, or databases are shared.

## Open the dashboard

- Once GitHub Pages is enabled, the intended website address is https://chennamatta889.github.io/career-ops-cloud/
- Source: [index.html](./index.html), [styles.css](./styles.css), [app.js](./app.js)
- To preview locally, clone/download the repository and open index.html in a browser.
- To enable hosting: open **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then run **Publish Career-Ops dashboard** in the Actions tab, or push an edit to the UI. This is a one-time repository setting.

## Phase 4 — Private Resume Vault, Cross-Device Tracking and Initial Discovery (historical)

This phase uses the separate Supabase project **career-ops-private**. It does not use or modify DraftflowAI.

**Private Resume Vault:** Sign in with Google, extract a PDF/DOCX/TXT resume in your browser, check the extracted text, then click **Save resume privately**. Only the extracted TEXT, source filename and timestamp are upserted to a user-owned Postgres row. No original PDF bytes are uploaded. On another device, sign in and choose **Load saved resume**, or select a job's AI Review to restore an existing saved resume into an empty editor. Use **Delete saved resume** to remove your cloud copy. These actions do not call Gemini; Gemini is called only after consent and the deliberate Review button.

**Cloud application tracking:** When signed in, saving a real job or moving its pipeline stage automatically updates its owner-only cloud record; removing it from Saved deletes the record. The Applications screen has **Sync tracked jobs** and **Upload this device's saved jobs**. The latter explicitly confirms migration of pre-existing local statuses. Demo listings are not synced. Browser-local statuses may remain after signout; local reset does not remove cloud records.

**Privacy and security:** Tables careerops_resume_vault and careerops_job_tracking have Row Level Security with owner-only policies for SELECT, INSERT, UPDATE and DELETE. Anonymous privileges are revoked; user access uses the signed-in JWT, not a public secret key. Postgres storage is not end-to-end encrypted; project administrators with elevated privileges may access it. No resume text is committed to public GitHub files. Database schema is tracked at supabase/migrations/20261121_phase4_private_vault_tracking.sql.

**Initial discovery expansion (superseded by Universal Discovery above):** Scanning previously included 32 publicly accessible Greenhouse/Ashby boards (up from 21), adding New Era Technology, Arcana Analytics, Instawork, Teikametrics, WPP, MerQube, Sarvam, OpenObserve, ScienceLogic, Arkose Labs and Lyric. Matches still depend on location, experience, title and deduplication filters and are not guaranteed. Selecting AI Review on a supported ATS job card attempts to fetch its public full job description while the private vault can refill the resume editor.

**What remains:** Generative AI reviews are still on-demand after explicit consent, not automatic batch Gemini scoring. AI Review offers text draft download plus browser **Print / Save as PDF** (using the device's print dialog; not a server-generated PDF). Native DOCX export and automatic job submissions are not activated. User-specific RLS operations require a real authenticated account to verify end to end.

## Gemini timeout and retry fix (November 21, 2026)

The AI Studio was observed to reach Supabase successfully, then a Gemini generation call took about 42.5 seconds and produced HTTP 502 because the function had a 42-second timeout. The next attempt received HTTP 429 because the original code applied a 60-second cooldown even on failure.

**Fixed in function v7:** provider timeout raised to 100 seconds (below Supabase's request idle timeout); Gemini 3.5 Flash-Lite is the faster default when no GEMINI_MODEL secret overrides it; Gemini 3.8 Flash uses low thinking level; responses are requested more concisely. Rate cooldown is now 20 seconds after a **successful** review only, with no 60-second lockout after failed or timed-out calls. The backend distinguishes provider timeout, quota, malformed JSON, and authentication errors. An in-worker in-flight request guard reduces accidental duplicate requests. AI Studio shows elapsed time and the selected Gemini model in its connection status.

Existing GEMINI_MODEL configuration takes precedence over the faster default. If the connection displays gemini-3.8-flash and generation still times out, the owner can select the faster gemini-3.5-flash-lite by setting GEMINI_MODEL securely in Supabase Edge Function secrets; check model availability and pricing before changing. No automatic repeat requests are made following provider errors to avoid surprise provider charges. AI output must be reviewed and verified.

## Phase 3B — Resume parsing and external employer job review

The dashboard now provides **local resume text extraction** and **public external job-description fetching**:

- **Resume Lab / AI Studio:** upload a text-based PDF, DOCX or TXT resume up to 6 MB. PDF.js 5.4.624 and Mammoth 1.11.0 are pinned, installed at build time and hosted on the **same GitHub Pages origin** under /vendor/ (not third-party scripts loaded at runtime). Browser extraction fills the editable AI Studio resume textarea, capped at 16,000 characters. No resume file is uploaded to Supabase or any third-party parsing API. The extracted text is transmitted to the private Gemini backend **only when you explicitly consent and click Review with AI**.
- **Image/scanned PDF:** OCR is **not provided**; an image-only PDF will show a plain-language extraction error. Multi-column text and special characters may be imperfect. Verify every field before reviewing.
- **External job URL:** paste a published official job URL from Greenhouse, Ashby, or Lever and choose **Fetch job description**. If the public employer API returns a matching posting, AI Studio fills the job title and editable full JD. The signed-in account's backend calls only official public ATS endpoints (no arbitrary URLs, redirects, login bypass, resume transfer, job application or external form submission).
- **Other sites:** LinkedIn, Indeed, Workday, custom career pages, logins, and blocked/removed listings are not scraped or bypassed. Copy and paste the job description when the fetch button reports unsupported or unavailable.
- **Privacy:** employer job descriptions are public data, while resumes are processed locally and AI reviews require consent. The external job-fetch endpoint requires an authenticated account with a verified email; private resume and tracking records are isolated by RLS. Imported JD remains in browser memory until explicitly reviewed. No database writes were added.

New source: resume-parser.js, scripts/resume-parser.test.cjs, supabase/functions/careerops-ai-review/job-fetch.mjs, scripts/job-fetch.test.mjs. The GitHub Actions Pages workflow installs and bundles the pinned parser assets, and runs security/unit checks before publishing. When working with a new resume, use a private browser tab and review the extracted result before requesting AI processing.

## AI Review troubleshooting (November 21, 2026)

The browser now checks the authenticated Supabase Edge Function when AI Studio opens and when **Check AI connection** is selected. The function returns readiness information **only to an authenticated verified user**, never exposing secret values.

- Single-email ALLOWED_EMAIL is no longer enforced; verified Google/Supabase users may use the AI function with daily usage caps.
- If the response says **Missing private settings: GEMINI_API_KEY, AI_CALLS_ENABLED**, configure `GEMINI_API_KEY` in the *private* project and set `AI_CALLS_ENABLED=true` only after verifying provider pricing and quotas.
- If you see EMAIL_UNVERIFIED, verify the sign-in address; missing usage controls must be repaired on Supabase, not in GitHub.
- If connection succeeds but review cannot start, paste at least **250 characters of resume text**, **200 characters of the complete job description**, include the job title, and select the consent checkbox. Choosing a public job card often supplies a title but **not its full job description**.
- If the browser says **Failed to fetch**, verify GitHub Pages published the latest frontend and that the Edge Function's APP_ORIGIN matches the site origin, `https://chennamatta889.github.io`. The function now also accepts a configured full Pages URL by extracting its origin.
- Authentication is still required. The function has gateway `verify_jwt=true` and independently validates the user token and verified email.
- The publishable key parsing bug was corrected: Supabase's `SUPABASE_PUBLISHABLE_KEYS` environment variable is JSON with **key values**, not the names of other environment variables.
- The service now allows larger Gemini JSON outputs to reduce truncation. This does not remove provider rate limits or usage costs.

**No live AI result has been verified yet:** it depends on your private Gemini secrets and an authenticated request. No application submission or email sending has been enabled.

## Google Sign-In for Career-Ops (November 21, 2026)

**Google is now the primary sign-in method for AI Studio**. The page opens `https://nnhzihcugvifhegsfmua.supabase.co/auth/v1/authorize?provider=google&redirect_to=...` from a direct user click. Supabase handles Google OAuth credentials and redirects to the allowlisted website `https://chennamatta889.github.io/career-ops-cloud/`. The static website stores only the returned Supabase session in tab-scoped sessionStorage and clears the token-bearing URL fragment. It never handles a Google OAuth client secret. Email magic links are retained under an optional collapsible fallback; signing in with Google does **not** consume Supabase's authentication-email quota.

To enable in the existing dedicated Career-Ops project, Google must be switched on under **Authentication → Sign In / Providers → Google** with a valid Web Client ID and Client Secret. In Google Cloud, register the callback URI `https://nnhzihcugvifhegsfmua.supabase.co/auth/v1/callback`. In Supabase Auth URL Configuration, permit `https://chennamatta889.github.io/career-ops-cloud/` as a redirect. The client-side Google button is usable only on the expected Career-Ops site origin and path. The private AI Edge Function **still enforces a valid Supabase JWT and a verified email address**; using Google does not bypass that allowlist.

CI tests the login URL construction, returned token handling, and error cases. The Pages workflow also performs a **read-only** Supabase Auth settings check for `external.google`. That check is nonblocking (an unavailable Auth settings endpoint will be reported rather than break the website deployment); a successful check only confirms the provider is enabled, not that the individual's login has succeeded. If Google returns an access-denied error, check the account is a Google OAuth test user (for apps in Testing mode) and the redirect URLs match exactly.

## Phase 3 — Private AI Studio (code ready, not yet activated)

The public UI includes an AI Studio page and an **AI review** action on job cards. It supports passwordless email sign-in, session-only resume text extraction (PDF/DOCX/TXT or paste), official public employer job URL importing, job title/employer/description inputs, explicit consent to third-party AI processing, fit analysis, suggested resume rewrites, cover letter, recruiter email, screening answer drafts, and a local .txt export. It never submits an application, uploads resume files for parsing, or modifies the original document.

**Backend created and deployed:** Career-Ops has its own separate Supabase project, `career-ops-private` (`nnhzihcugvifhegsfmua`, ap-south-1, initially quoted at $0/month), with the `careerops-ai-review` Edge Function ACTIVE and `verify_jwt=true`. Its browser-safe project URL and publishable key are in `careerops-config.js`. DraftflowAI has not been altered. AI requests remain intentionally disabled until the Gemini provider key, Gemini key, quota protection, and AI_CALLS_ENABLED=true are configured.

### Activation checklist

1. Dedicated Career-Ops Supabase project is created: https://supabase.com/dashboard/project/nnhzihcugvifhegsfmua .
2. **Action still required in Supabase Dashboard:** On the new project, open Authentication → URL Configuration, set Site URL and an exact allowed Redirect URL to `https://chennamatta889.github.io/career-ops-cloud/`. Enable email sign-in. The connected management tools cannot change these Auth URL settings.
3. Deploy the source at supabase/functions/careerops-ai-review/index.ts as a Supabase Edge Function. Gateway JWT verification remains **enabled** for user access tokens, while the handler also validates tokens with Supabase Auth and requires a verified email and server-reserved AI quota. Never remove these safeguards.
4. In **that separate project only**, configure function secrets: GEMINI_API_KEY (from Google AI Studio), AI_CALLS_ENABLED=true, APP_ORIGIN=https://chennamatta889.github.io . Optionally set GEMINI_MODEL (defaults to gemini-3.5-flash-lite). Model availability, free-tier limits, and pricing depend on the AI provider; confirm them before activating billable traffic. **Never commit or paste API keys into the frontend, GitHub, or chat.**
5. **Done:** Public-only `careerops-config.js` now uses the new project's URL and its browser-safe **publishable** key. No secret or service-role key has been stored in the repository. GitHub Pages must still successfully publish via the workflow; live availability is not confirmed.
6. Test one email sign-in, one real job review with full JD/resume text, downloaded draft, and sign-out. Confirm all private information is absent from the public Pages assets.

### Security and privacy

- Resume and job description are held in memory in the browser tab. They are sent only after explicit consent to the authenticated Edge Function and Gemini provider. Neither text nor generated drafts are persisted in database tables or GitHub.
- Session tokens are stored only in browser sessionStorage; user should sign out on shared devices.
- The backend requires a verified authenticated user. Gemini calls are limited to 2 attempts per user and 20 total attempts per UTC day through an atomic database quota, including failed provider calls. Review provider-side spending limits too.
- No auto-apply, email sending, PDF/DOCX parsing or recruiter messaging is enabled. Generated content must be fact-checked by a human.

## Dashboard v2 — explainable matching and better resilience

**Phase 2 is deployed to source control; GitHub Pages must successfully publish to see it.**

- **Transparent priority indicator (0–100):** role alignment 50 points, preferred location 30 points, and matching advertised skills 20 points. This uses simple local rules, **not AI, not a resume parser, and not an ATS or eligibility prediction**.
- **Evidence quality:** the interface distinguishes limited scan metadata from more informative job descriptions. Unknown requirements are not assumed to be satisfied.
- **Why this priority?** Each card opens a breakdown of matched role, location, available skills, and the public posting's experience label when supplied.
- **Sort and filter** by priority while still supporting newest-first and other search filters; changing Resume Lab preferences recalculates priorities on the device.
- **Resilience:** when upstream scanner checkout or dependency installation fails, the GitHub Pages build can still publish with a failure-status feed, instead of failing before the website is deployed. Pages account/repository settings still have to allow deployment.
- **Privacy:** preferences, tracking and selected resume files stay local to the browser; only public job data is published by GitHub Actions.

The public posting feed now includes a stated years-of-experience label (if present), used for warnings about roles above the selected range. No automated application submissions or AI tailoring are activated.

## Dashboard v1

- Responsive overview, sample opportunity cards, and pipeline visualization.
- Search/filter by title, company, skill, and location.
- Add real opportunities manually, with optional official job URL.
- Track Saved, Review, Applied, Interview, Offer, and Rejected stages.
- Save preferred roles, locations, experience band, and skills locally.
- Select a PDF/DOCX resume locally **without uploading, parsing, or storing the file**.
- Import a JSON array of jobs or a JSON object with a jobs, matches, results, discovered_jobs, matched_jobs, opportunities, or listings array, using common job title/company/location/url fields.
- Export the workspace as JSON, reset the demo, and see a local activity log.

The dashboard automatically reads the public-only `data/jobs.json` feed generated by the **Publish Career-Ops dashboard** workflow. You can also manually add jobs or import JSON. The original summary-only scan receipt is not itself a job-list feed.

### Not yet implemented

This is a UI prototype, not a production application agent. Sample jobs are fictional and not confirmed vacancies. No AI resume matching, AI resume tailoring, account login, email monitoring, automatic submission, or real-time employer status is connected. **Public job discovery is connected via a scheduled GitHub Action, not by an on-demand browser scan.** Setting Applied manually records a personal tracking status, not proof of submission.

## Scanner

**Historical note (superseded):** The dashboard once checked **21 IT-focused Greenhouse/Ashby career boards** for India-based DevOps, Cloud, SRE, Platform, Infrastructure, Build, and Release openings. Current scanner behavior and sources are described in **Universal IT and Non-IT Job Discovery** at the top of this README. Employer sources include Cohere Health, Ivanti, HackerRank, CrashPlan, Motive, Zenoti, BusPatrol, Encord, and other boards validated as real public career sites. This is deliberately not an exhaustive India-wide job search. A listing is included only when it survives role, level, experience, location, and deduplication filters; the count may still be small.

The **Publish Career-Ops dashboard** workflow scans public postings during its deployment and is scheduled daily for **10:00 AM IST** (GitHub scheduled jobs can run late). It exports posting title, employer, region and public URL only; private resumes and application details are never deployed. The website's Refresh jobs button re-fetches the latest *published* feed and does not start a new scan. To run an extra scan, manually dispatch the publishing workflow from GitHub Actions.

If the GitHub Pages deployment is not enabled or a workflow run fails, the website may show unavailable/stale data. The scanner feed status differentiates success, partial failures, and failed runs.

The [existing read-only workflow](./.github/workflows/career-ops-cloud-test.yml) checks public job sources using role and India-region filters. It is an isolated test and produces a JSON scan receipt under GitHub Actions. No emails or job applications are sent. Upstream Career-Ops is MIT licensed.

## Privacy and security

**This repository is public.** Never commit resumes, contact information, credentials, API keys, applicant answers, or private application reports. The dashboard saves jobs, preferences, and status changes only in the browser's localStorage; it has no private account or backend. File imports and exports happen inside the browser. Choosing a resume reads its text locally in the browser and populates AI Studio; file bytes are not uploaded to the parsing service. AI Review sends resume text to the private function and Gemini only after consent.

For real multi-user access or automated applications, first add a private authenticated backend with authorization, secret management, and real submission/confirmation tracking.
