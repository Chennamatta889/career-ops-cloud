# Career-Ops Cloud Sandbox

A standalone experiment running the original [Career-Ops](https://github.com/career-ops-hq/career-ops) scanner through GitHub Actions, plus a responsive **Career-Ops job-search dashboard** with a DraftflowAI-inspired style. This repository remains independent from DraftflowAI: no code, accounts, credentials, secrets, resumes, or databases are shared.

## Open the dashboard

- Once GitHub Pages is enabled, the intended website address is https://chennamatta889.github.io/career-ops-cloud/
- Source: [index.html](./index.html), [styles.css](./styles.css), [app.js](./app.js)
- To preview locally, clone/download the repository and open index.html in a browser.
- To enable hosting: open **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then run **Publish Career-Ops dashboard** in the Actions tab, or push an edit to the UI. This is a one-time repository setting.

## Phase 4 — Private Resume Vault, Cross-Device Tracking and 32-Source Discovery

This phase uses the separate Supabase project **career-ops-private**. It does not use or modify DraftflowAI.

**Private Resume Vault:** Sign in with Google, extract a PDF/DOCX/TXT resume in your browser, check the extracted text, then click **Save resume privately**. Only the extracted TEXT, source filename and timestamp are upserted to a user-owned Postgres row. No original PDF bytes are uploaded. On another device, sign in and choose **Load saved resume**, or select a job's AI Review to restore an existing saved resume into an empty editor. Use **Delete saved resume** to remove your cloud copy. These actions do not call Gemini; Gemini is called only after consent and the deliberate Review button.

**Cloud application tracking:** When signed in, saving a real job or moving its pipeline stage automatically updates its owner-only cloud record; removing it from Saved deletes the record. The Applications screen has **Sync tracked jobs** and **Upload this device's saved jobs**. The latter explicitly confirms migration of pre-existing local statuses. Demo listings are not synced. Browser-local statuses may remain after signout; local reset does not remove cloud records.

**Privacy and security:** Tables careerops_resume_vault and careerops_job_tracking have Row Level Security with owner-only policies for SELECT, INSERT, UPDATE and DELETE. Anonymous privileges are revoked; user access uses the signed-in JWT, not a public secret key. Postgres storage is not end-to-end encrypted; project administrators with elevated privileges may access it. No resume text is committed to public GitHub files. Database schema is tracked at supabase/migrations/20261121_phase4_private_vault_tracking.sql.

**Discovery expansion:** Scanning includes 32 publicly accessible Greenhouse/Ashby boards (up from 21), adding New Era Technology, Arcana Analytics, Instawork, Teikametrics, WPP, MerQube, Sarvam, OpenObserve, ScienceLogic, Arkose Labs and Lyric. Matches still depend on location, experience, title and deduplication filters and are not guaranteed. Selecting AI Review on a supported ATS job card attempts to fetch its public full job description while the private vault can refill the resume editor.

**What remains:** Generative AI reviews are still on-demand after explicit consent, not automatic batch Gemini scoring. Native DOCX/PDF exports and automatic job submissions are not activated; existing AI Studio text draft export remains available. User-specific RLS operations require a real authenticated account to verify end to end.

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
- **Privacy:** employer job descriptions are public data, while resumes are processed locally and AI reviews require consent. The external job-fetch endpoint is JWT protected and checks the same account allowlist as AI review. Imported JD remains in browser memory until explicitly reviewed. No database writes were added.

New source: resume-parser.js, scripts/resume-parser.test.cjs, supabase/functions/careerops-ai-review/job-fetch.mjs, scripts/job-fetch.test.mjs. The GitHub Actions Pages workflow installs and bundles the pinned parser assets, and runs security/unit checks before publishing. When working with a new resume, use a private browser tab and review the extracted result before requesting AI processing.

## AI Review troubleshooting (November 21, 2026)

The browser now checks the authenticated Supabase Edge Function when AI Studio opens and when **Check AI connection** is selected. The function returns readiness information **only to the email allowlisted account**, never exposing secret values.

- If you see **AI connection check failed: Career-Ops account allowlist is not configured**, add `ALLOWED_EMAIL` in the separate Career-Ops project's **Edge Functions → Secrets**. The signed-in account email must match this value.
- If the response says **Missing private settings: GEMINI_API_KEY, AI_CALLS_ENABLED**, configure `GEMINI_API_KEY` in the *private* project and set `AI_CALLS_ENABLED=true` only after verifying provider pricing and quotas.
- If the function says **Signed-in email is not authorized**, review `ALLOWED_EMAIL`. Do not place that setting in GitHub.
- If connection succeeds but review cannot start, paste at least **250 characters of resume text**, **200 characters of the complete job description**, include the job title, and select the consent checkbox. Choosing a public job card often supplies a title but **not its full job description**.
- If the browser says **Failed to fetch**, verify GitHub Pages published the latest frontend and that the Edge Function's APP_ORIGIN matches the site origin, `https://chennamatta889.github.io`. The function now also accepts a configured full Pages URL by extracting its origin.
- Authentication is still required. The function has gateway `verify_jwt=true` and independently validates the user token and email allowlist.
- The publishable key parsing bug was corrected: Supabase's `SUPABASE_PUBLISHABLE_KEYS` environment variable is JSON with **key values**, not the names of other environment variables.
- The service now allows larger Gemini JSON outputs to reduce truncation. This does not remove provider rate limits or usage costs.

**No live AI result has been verified yet:** it depends on your private Gemini secrets and an authenticated request. No application submission or email sending has been enabled.

## Google Sign-In for Career-Ops (November 21, 2026)

**Google is now the primary sign-in method for AI Studio**. The page opens `https://nnhzihcugvifhegsfmua.supabase.co/auth/v1/authorize?provider=google&redirect_to=...` from a direct user click. Supabase handles Google OAuth credentials and redirects to the allowlisted website `https://chennamatta889.github.io/career-ops-cloud/`. The static website stores only the returned Supabase session in tab-scoped sessionStorage and clears the token-bearing URL fragment. It never handles a Google OAuth client secret. Email magic links are retained under an optional collapsible fallback; signing in with Google does **not** consume Supabase's authentication-email quota.

To enable in the existing dedicated Career-Ops project, Google must be switched on under **Authentication → Sign In / Providers → Google** with a valid Web Client ID and Client Secret. In Google Cloud, register the callback URI `https://nnhzihcugvifhegsfmua.supabase.co/auth/v1/callback`. In Supabase Auth URL Configuration, permit `https://chennamatta889.github.io/career-ops-cloud/` as a redirect. The client-side Google button is usable only on the expected Career-Ops site origin and path. The private AI Edge Function **still enforces a valid Supabase JWT and its configured ALLOWED_EMAIL**; using Google does not bypass that allowlist.

CI tests the login URL construction, returned token handling, and error cases. The Pages workflow also performs a **read-only** Supabase Auth settings check for `external.google`. That check is nonblocking (an unavailable Auth settings endpoint will be reported rather than break the website deployment); a successful check only confirms the provider is enabled, not that the individual's login has succeeded. If Google returns an access-denied error, check the account is a Google OAuth test user (for apps in Testing mode) and the redirect URLs match exactly.

## Phase 3 — Private AI Studio (code ready, not yet activated)

The public UI includes an AI Studio page and an **AI review** action on job cards. It supports passwordless email sign-in, session-only resume text extraction (PDF/DOCX/TXT or paste), official public employer job URL importing, job title/employer/description inputs, explicit consent to third-party AI processing, fit analysis, suggested resume rewrites, cover letter, recruiter email, screening answer drafts, and a local .txt export. It never submits an application, uploads resume files for parsing, or modifies the original document.

**Backend created and deployed:** Career-Ops has its own separate Supabase project, `career-ops-private` (`nnhzihcugvifhegsfmua`, ap-south-1, initially quoted at $0/month), with the `careerops-ai-review` Edge Function ACTIVE and `verify_jwt=true`. Its browser-safe project URL and publishable key are in `careerops-config.js`. DraftflowAI has not been altered. AI requests remain intentionally disabled until the Gemini provider key, account allowlist and `AI_CALLS_ENABLED=true` secrets are configured.

### Activation checklist

1. Dedicated Career-Ops Supabase project is created: https://supabase.com/dashboard/project/nnhzihcugvifhegsfmua .
2. **Action still required in Supabase Dashboard:** On the new project, open Authentication → URL Configuration, set Site URL and an exact allowed Redirect URL to `https://chennamatta889.github.io/career-ops-cloud/`. Enable email sign-in. The connected management tools cannot change these Auth URL settings.
3. Deploy the source at supabase/functions/careerops-ai-review/index.ts as a Supabase Edge Function. Gateway JWT verification remains **enabled** for user access tokens, while the handler also validates tokens with Supabase Auth and restricts the email to an allowlist. Never remove these safeguards.
4. In **that separate project only**, configure function secrets: GEMINI_API_KEY (from Google AI Studio), ALLOWED_EMAIL (your approved sign-in email), AI_CALLS_ENABLED=true, APP_ORIGIN=https://chennamatta889.github.io . Optionally set GEMINI_MODEL (defaults to gemini-3.8-flash). Model availability, free-tier limits, and pricing depend on the AI provider; confirm them before activating billable traffic. **Never commit or paste API keys into the frontend, GitHub, or chat.**
5. **Done:** Public-only `careerops-config.js` now uses the new project's URL and its browser-safe **publishable** key. No secret or service-role key has been stored in the repository. GitHub Pages must still successfully publish via the workflow; live availability is not confirmed.
6. Test one email sign-in, one real job review with full JD/resume text, downloaded draft, and sign-out. Confirm all private information is absent from the public Pages assets.

### Security and privacy

- Resume and job description are held in memory in the browser tab. They are sent only after explicit consent to the authenticated Edge Function and Gemini provider. Neither text nor generated drafts are persisted in database tables or GitHub.
- Session tokens are stored only in browser sessionStorage; user should sign out on shared devices.
- The backend requires an authenticated user and a configured allowlisted email, enforces input limits, and limits requests per function instance. This is NOT a global cost quota; configure provider billing limits.
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

The dashboard publishing workflow now checks **21 publicly accessible Greenhouse/Ashby career boards** (expanded from 3) for India-based DevOps, Cloud, SRE, Platform, Infrastructure, Build, and Release openings. Employer sources include Cohere Health, Ivanti, HackerRank, CrashPlan, Motive, Zenoti, BusPatrol, Encord, and other boards validated as real public career sites. This is deliberately not an exhaustive India-wide job search. A listing is included only when it survives role, level, experience, location, and deduplication filters; the count may still be small.

The **Publish Career-Ops dashboard** workflow scans public postings during its deployment and is scheduled daily for **10:00 AM IST** (GitHub scheduled jobs can run late). It exports posting title, employer, region and public URL only; private resumes and application details are never deployed. The website's Refresh jobs button re-fetches the latest *published* feed and does not start a new scan. To run an extra scan, manually dispatch the publishing workflow from GitHub Actions.

If the GitHub Pages deployment is not enabled or a workflow run fails, the website may show unavailable/stale data. The scanner feed status differentiates success, partial failures, and failed runs.

The [existing read-only workflow](./.github/workflows/career-ops-cloud-test.yml) checks public job sources using role and India-region filters. It is an isolated test and produces a JSON scan receipt under GitHub Actions. No emails or job applications are sent. Upstream Career-Ops is MIT licensed.

## Privacy and security

**This repository is public.** Never commit resumes, contact information, credentials, API keys, applicant answers, or private application reports. The dashboard saves jobs, preferences, and status changes only in the browser's localStorage; it has no private account or backend. File imports and exports happen inside the browser. Choosing a resume reads its text locally in the browser and populates AI Studio; file bytes are not uploaded to the parsing service. AI Review sends resume text to the private function and Gemini only after consent.

For real multi-user access or automated applications, first add a private authenticated backend with authorization, secret management, and real submission/confirmation tracking.
