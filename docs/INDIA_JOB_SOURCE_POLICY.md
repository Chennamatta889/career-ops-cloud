# India job discovery: source access and integration policy

Reviewed 21 November 2026. Implementation is read-only; not legal advice.

## Priority platforms

| Portal | Supported integration in Career-Ops | Access restriction |
| --- | --- | --- |
| Naukri | User-initiated outbound role/location search only | No verified public, general-purpose job-search API; get permission or a commercial feed agreement before ingestion. |
| LinkedIn Jobs | Homepage navigation only; users search Jobs directly on LinkedIn | LinkedIn's published Job Posting API is for approved posting partners, not anonymous cross-employer job search; its user agreement restricts unapproved scraping. |
| Indeed India | User-initiated outbound role/location search only | The Job Sync API is an ATS/employer-partner publishing/management API, not a public read-all-jobs search API; unapproved automated extraction is restricted. |
| Official employer ATS | Selected public, read-only postings | Greenhouse, Ashby, Lever and SmartRecruiters are active; a Workable adapter exists but its eight proposed feeds failed to connect and are not activated. |

### Documentation and policy references

- LinkedIn partner Job Posting API: https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview
- LinkedIn user agreement (including deep-link restrictions): https://www.linkedin.com/legal/user-agreement
- Indeed Job Sync API: https://docs.indeed.com/job-sync-api
- Indeed Terms of Service: https://in.indeed.com/legal
- Workable documented public job board: https://workable.readme.io/reference/jobs-1
- Workable help (public endpoint): https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page
- Recruitee public offers (not implemented yet): https://docs.recruitee.com/reference/offers
- Greenhouse Job Board API: https://developers.greenhouse.io/job-board.html
- Ashby public job posting API: https://developers.ashbyhq.com/docs/public-job-posting-api

## Implementation

- The website provides **user-initiated search links** for Naukri and Indeed. A visitor's role keyword and selected India location are encoded into those outgoing links. LinkedIn opens its homepage only; users search Jobs there themselves because its agreement restricts unapproved deep-linking. No extraction, authentication or server requests to those portals occur. Sector/experience/priority filters are NOT transferred. A portal may ignore or change its query URL.
- A Workable adapter supports its documented `GET https://www.workable.com/api/accounts/{subdomain}?details=true` public endpoint (no token). However, all eight proposed sources failed with `fetch failed` from GitHub Actions on November 21, 2026. They are not active scanned boards and their listings are not represented as indexed jobs. Instead, Career-Ops links to the original employer career pages for Mercari India, Capgemini Insurance, Unison Group, Proximity Works, Teleport, Updraft, YouTrip and Zyte. Do not enable the scanner boards until access, permission and reliable retrieval are verified.
- If an authorized Workable source is activated later, each posting must link to `https://apply.workable.com/{subdomain}/j/{shortcode}/`. If its account API fails or the JSON is invalid, mark that board unavailable; never fabricate postings.
- The source catalog remains a **curated subset of employers** and is not an exhaustive Indian job search. A source's technical availability does not constitute blanket permission to sublicense its content. Follow each provider's terms, use conservative refresh rates, avoid reproducing unnecessary content, preserve source attribution, and seek written authorization if expanding commercial redistribution or ingesting restricted portals.
- User credentials, resumes, applications, recruiter contacts and private mailbox data are not sent to any of these sources. Users always complete applications at the employer/portal.

## Future expansion criteria

Before ingesting more portal postings: (1) document the provider's written API/feed permissions and permitted display use, (2) verify the exact company/source endpoint and public job board, (3) test location, deduplication, pagination and freshness, (4) cap response size and fail without fabricating results, and (5) verify production source health. Do not use unofficial scrape APIs, stealth automation, CAPTCHA bypass, or a logged-in user's session as a replacement for permission.
