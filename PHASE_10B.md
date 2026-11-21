# Phase 10B — Enterprise & Product Company Job Discovery

Implemented on 21 November 2026. This document distinguishes **actual imported job postings** from **official career search portals**. No employer-job applications or credentials are used.

## Deployed features

- `enterprise-careers.json` is the allowlisted 13-company directory (6 IT services + 7 product companies). It lists verified official career URLs, not fictitious individual vacancies. Each entry has `method: official_portal`; it intentionally has no job counts, requisition IDs, dates or application status.
- `enterprise-careers.js` provides a searchable and filterable directory within the existing Find Jobs page, visually separated from real job cards, opening official sites using safe HTTPS links. No local-storage, tracking state, application mutations, email sending or background browser automation.
- Additional public **Greenhouse** job boards: GitLab, Canonical, Cloudflare, Braze. Additional public **Ashby** job boards: 1Password, Crusoe. These are **not** any of the 13 target employers. Individual job cards come only from published, validated responses to their supported public boards. Their URLs retain original official ATS job IDs and link to real employer postings.
- Existing Greenhouse/Ashby/Lever scanner is unchanged in provider authorization logic, retains 13 job categories, location and experience filtering, actual-source health, duplicates prevention, and the empty/degraded feed deployment guard.
- CI includes validation of all 13 official hosts, allowed schemes, no duplicate company names or invented jobs, role-based employer filters, permission-gated ATS engines, product-company source configuration, and complete existing app/privacy/security regressions.

## Official career sites (manual handoff, not individual postings)

| Employer | Career portal |
|---|---|
| TCS | https://www.tcs.com/careers/india/lateral-hiring |
| Accenture | https://www.accenture.com/in-en/careers/jobsearch |
| Wipro | https://careers.wipro.com/viewalljobs/?locale=en_US |
| Infosys | https://www.infosys.com/careers/apply/ |
| IBM | https://www.ibm.com/in-en/careers/search |
| Capgemini | https://careers.capgemini.com/ |
| Google | https://www.google.com/about/careers/applications/jobs/results/ |
| Microsoft | https://careers.microsoft.com/v2/global/en/locations/india.html |
| Amazon / AWS | https://www.amazon.jobs/en/search?country%5B%5D=IND |
| Oracle | https://careers.oracle.com/en/sites/jobsearch/jobs?hl=en-IN |
| Adobe | https://careers.adobe.com/us/en/search-results/ |
| ServiceNow | https://careers.servicenow.com/jobs/ |
| Atlassian | https://www.atlassian.com/company/careers/all-jobs |

## ATS integration eligibility and access boundaries

| Engine | Current disposition | Reason |
|---|---|---|
| Greenhouse public Job Board API | Enabled for verified configured employer boards only | Public documented posting endpoint; does not imply application submission authorization |
| Ashby public Posting API | Enabled for verified configured employer boards only | Public posting endpoint; exclude unlisted postings |
| Lever public Postings API | Enabled for verified configured employer boards only | Read-only public postings with bounded pagination |
| Workday Recruiting | **Not enabled** for arbitrary employers | Employer tenant/customer permissions, terms and endpoint rules must be verified. Do not automate undocumented CXS endpoints or attempt to defeat access restrictions |
| SAP SuccessFactors Recruiting | **Not enabled** without employer-approved feed | SAP Recruiting Posting supports job-board distribution via authorized API/XML/other delivery. Enterprise OData requires permission configuration |
| Oracle Recruiting Cloud | **Not enabled** without employer-approved integration | Job Requisitions and Job Site REST privileges depend on the customer tenant; third-party/direct-apply partners require configuration/permissions |
| Company-specific TCS/Accenture/Infosys/IBM etc. | **Official portal handoff** | No employer-authorized data export or documented approved public integration in this release; do not infer job IDs from HTML and do not pass portal links off as vacancies |

Evidence / provider documentation:
- Workday site terms: https://www.workday.com/en-us/legal/site-terms.html
- SAP Recruiting Posting job board integrations: https://userapps.support.sap.com/sap/support/knowledge/en/2773045
- Oracle job site posted jobs: https://docs.oracle.com/en/cloud/saas/human-resources/farws/api-job-site-posted-jobs.html
- Oracle integration and job distribution: https://docs.oracle.com/en/cloud/saas/talent-management/faimh/integrating-third-party-services.html
- Greenhouse public job board API: https://developers.greenhouse.io/job-board.html
- Ashby public posting API: https://developers.ashbyhq.com/docs/public-job-posting-api
- Lever Postings API: https://github.com/lever/postings-api

## Approval gate for future enterprise feeds

A new enterprise source becomes an *actual listing connector* only after recording: (1) the exact verified employer and official domain, (2) a documented or expressly permitted read-only feed and its authentication/usage terms, (3) allowed pagination/rate limits, (4) source job IDs and canonical employer links, (5) a live nonempty sample without personal data, (6) error handling and a disabled-on-failure path, and (7) CI proving no fabricated results, no application submissions, and no cross-user tracking changes.

If a company does not satisfy those requirements, keep its official career portal link instead. **A portal is never an application and never a job posting**.

## Production verification

The GitHub Actions root and source release workflows run the full unit/regression suite, build and publish the portal catalog, scan supported public ATS boards, verify the protected previous site assets and legal/AdSense/Search Console files, and check the live `/data/jobs.json` feed separately from `/data/enterprise-careers.json`.

The separate live Chromium QA workflow tests actual desktop/mobile job search, a synthetic guest-only tracking flow, and directory navigation/filtering. It does **not** sign in or submit an application to any employer. No existing My applications records are altered by this phase.
