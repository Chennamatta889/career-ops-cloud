# Career-Ops Cloud Sandbox

A standalone experiment running the original [Career-Ops](https://github.com/career-ops-hq/career-ops) scanner through GitHub Actions, plus a responsive **Career-Ops job-search dashboard** with a DraftflowAI-inspired style. This repository remains independent from DraftflowAI: no code, accounts, credentials, secrets, resumes, or databases are shared.

## Open the dashboard

- Once GitHub Pages is enabled, the intended website address is https://chennamatta889.github.io/career-ops-cloud/
- Source: [index.html](./index.html), [styles.css](./styles.css), [app.js](./app.js)
- To preview locally, clone/download the repository and open index.html in a browser.
- To enable hosting: open **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then run **Publish Career-Ops dashboard** in the Actions tab, or push an edit to the UI. This is a one-time repository setting.

## Phase 3 — Private AI Studio (code ready, not yet activated)

The public UI includes an AI Studio page and an **AI review** action on job cards. It supports passwordless email sign-in, session-only resume text entry (paste or .txt import), job title/employer/description inputs, explicit consent to third-party AI processing, fit analysis, suggested resume rewrites, cover letter, recruiter email, screening answer drafts, and a local .txt export. It never sends an application, uploads an entire PDF, or modifies an existing resume.

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

**This repository is public.** Never commit resumes, contact information, credentials, API keys, applicant answers, or private application reports. The dashboard saves jobs, preferences, and status changes only in the browser's localStorage; it has no private account or backend. File imports and exports happen inside the browser. Choosing a resume shows its filename in the current session but does not read or upload it.

For real multi-user access or automated applications, first add a private authenticated backend with authorization, secret management, and real submission/confirmation tracking.
