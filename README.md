# Career-Ops Cloud Sandbox

A standalone experiment running the original [Career-Ops](https://github.com/career-ops-hq/career-ops) scanner through GitHub Actions, plus a responsive **Career-Ops job-search dashboard** with a DraftflowAI-inspired style. This repository remains independent from DraftflowAI: no code, accounts, credentials, secrets, resumes, or databases are shared.

## Open the dashboard

- Once GitHub Pages is enabled, the intended website address is https://chennamatta889.github.io/career-ops-cloud/
- Source: [index.html](./index.html), [styles.css](./styles.css), [app.js](./app.js)
- To preview locally, clone/download the repository and open index.html in a browser.
- To enable hosting: open **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then run **Publish Career-Ops dashboard** in the Actions tab, or push an edit to the UI. This is a one-time repository setting.

## Dashboard v1

- Responsive overview, sample opportunity cards, and pipeline visualization.
- Search/filter by title, company, skill, and location.
- Add real opportunities manually, with optional official job URL.
- Track Saved, Review, Applied, Interview, Offer, and Rejected stages.
- Save preferred roles, locations, experience band, and skills locally.
- Select a PDF/DOCX resume locally **without uploading, parsing, or storing the file**.
- Import a JSON array of jobs or a JSON object with a jobs, matches, results, discovered_jobs, matched_jobs, opportunities, or listings array, using common job title/company/location/url fields.
- Export the workspace as JSON, reset the demo, and see a local activity log.

A **summary-only scanner receipt with no individual job records cannot populate the dashboard**. The UI is not yet connected to the scanner automatically.

### Not yet implemented

This is a UI prototype, not a production application agent. Sample jobs are fictional and not confirmed vacancies. No AI job scoring, resume tailoring, account login, job portal automation, email monitoring, automatic submission, or real-time employer status is connected. Setting Applied manually records a personal tracking status, not proof of submission.

## Scanner

The [existing read-only workflow](./.github/workflows/career-ops-cloud-test.yml) checks public job sources using role and India-region filters. It is an isolated test and produces a JSON scan receipt under GitHub Actions. No emails or job applications are sent. Upstream Career-Ops is MIT licensed.

## Privacy and security

**This repository is public.** Never commit resumes, contact information, credentials, API keys, applicant answers, or private application reports. The dashboard saves jobs, preferences, and status changes only in the browser's localStorage; it has no private account or backend. File imports and exports happen inside the browser. Choosing a resume shows its filename in the current session but does not read or upload it.

For real multi-user access or automated applications, first add a private authenticated backend with authorization, secret management, and real submission/confirmation tracking.
