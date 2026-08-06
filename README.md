# AI Recruitment Intelligence System (n8n)

An end-to-end AI-powered recruitment pipeline built on n8n: candidates upload a CV,
get screened by an LLM against job requirements, shortlisted candidates get
GitHub-based technical enrichment, and an AI-generated interviewer briefing
(claim-vs-evidence discrepancies + suggested follow-up questions) is ready before
the interview even starts. HR reviews everything through a lightweight internal
dashboard instead of digging through a spreadsheet.

Built and iterated based on real feedback from a Senior Backend Engineer — see
[CHANGELOG](#changelog--design-decisions) below for what changed between v1 and v2
and why.

## Architecture

```
                        ┌─────────────────────┐
   Candidate ──POST──▶  │  REC-01: CV Screening │
   (CV + job info)      └──────────┬───────────┘
                                    │
                    Extract PDF → Mask PII (regex, before LLM)
                                    │
                         AI Extraction (Llama-3.1-8B)
                                    │
                         AI Screening (Llama-3.3-70B)
                                    │
                            Log to Sheet (always, first)
                                    │
                          ┌─────────┴─────────┐
                     Shortlisted           Rejected
                          │                    │
              ┌───────────┴──────────┐    Rejection email
              │ Respond to frontend  │    (fast path, no
              │  IMMEDIATELY here    │     GitHub calls)
              └───────────┬──────────┘
                           │  (continues in background)
              GitHub username → cache check (Sheets, TTL 30d)
                           │
                cache hit ─┴─ cache miss → GitHub API
                           │      (profile, top repos, languages,
                           │       manifest files, retry w/ backoff)
                           │
              AI Interviewer Briefing (discrepancy + questions)
                           │
              Update the SAME candidate row + send interview email

   ┌──────────────────────┐        ┌───────────────────────────┐
   │ REC-02: Job Postings │        │ REC-03: Candidates Dashboard│
   │ public GET endpoint  │        │ internal GET, Header Auth   │
   └──────────────────────┘        └───────────────────────────┘
```

**Key design decision:** the webhook responds to the candidate's browser
*before* GitHub enrichment + briefing generation finish — that background work
can take 20-40s (up to ~20 sequential GitHub API calls per candidate), which
would otherwise time out the frontend request. Enrichment continues
server-side and updates the same Sheet row once done.

## Stack

- **n8n Cloud** — orchestration
- **Groq** (Llama 3.1 8B + Llama 3.3 70B) — right-sized per task: small/fast
  model for extraction, larger model for reasoning/screening/briefing
- **Google Sheets** — candidate log + GitHub response cache
- **Gmail** — candidate notifications
- **GitHub REST API** — technical enrichment (unauthenticated or PAT)
- Plain HTML/JS frontends (candidate form + HRD dashboard), no framework

## Files

| File | What it is |
|---|---|
| `REC-01_AI_Recruitment_Intelligence_System.json` | Main screening + enrichment + briefing workflow |
| `REC-02_Get_Job_Posting.json` | Public endpoint serving active job listings |
| `REC-03_Get_Candidates_Dashboard.json` | Internal endpoint for the HR dashboard (Header Auth protected) |
| `hrd-dashboard.html` | HR-facing dashboard: filterable candidate list + GitHub tech-stack visualization + AI briefing |

## Setup

1. Import all three workflow JSON files into n8n.
2. Create credentials for each placeholder referenced in the JSON (Groq API,
   Google Sheets OAuth2, Gmail OAuth2, Header Auth for the CV endpoint, Header
   Auth for the dashboard endpoint) and re-link them in the relevant nodes.
3. Create a Google Sheet with two tabs:
   - Main log — columns: `Candidate ID, Timestamp, Name, Email, Phone, Position, Experience, Skills, Education, Previous Companies, AI Score, Recommendation, Status, GitHub Username, GitHub Tech Stack, GitHub Last Activity, Interviewer Discrepancy Notes, Suggested Follow-up Questions`
   - `GitHub Cache` tab — columns: `github_username, cached_data, cached_at`
4. Replace `YOUR_SPREADSHEET_ID_HERE` / `YOUR_JOB_POSTINGS_SPREADSHEET_ID_HERE`
   in the JSON (or just reselect the sheet in each node's UI after import).
5. (Optional) In `FetchGithubEnrichmentLive`, replace `YOUR_GITHUB_TOKEN_HERE`
   with a GitHub Personal Access Token (no scopes needed — public read only)
   to raise the rate limit from 60/hr to 5000/hr.
6. In `hrd-dashboard.html`, set `CANDIDATES_WEBHOOK` to your production
   `get-candidates` URL.
7. Set up a Global Error Handler workflow (Error Trigger → log to a Sheet tab
   → email) and point each workflow's Settings → Error Workflow at it.

## Changelog / Design Decisions

**v1 → v1.1**
- Added `Retry On Fail` (3 tries, 1s backoff) to every node calling an
  external API — v1 had none, so a single Groq/Sheets/Gmail hiccup killed
  the whole run.
- Right-sized the LLM per task: extraction (simple structured pull) moved to
  an 8B model; screening (actual judgment) kept on 70B.
- PII minimization: email/phone are now regex-extracted *before* the CV text
  reaches the LLM, and redacted from what the model sees. Candidate name is
  masked in the screening prompt specifically (not needed for skill-matching).
- Standardized node naming, added a proper README sticky note.

**v1.1 → v2**
- GitHub Enrichment: username parsed from CV text, GitHub profile + top 5
  repos + per-repo language breakdown + manifest-file detection
  (`pyproject.toml` / `composer.json` / `package.json`), wrapped in a
  retry-with-backoff helper (transient failures retried, 404s are not).
- Google Sheets–backed cache (30-day TTL) to avoid re-hitting the GitHub API
  for repeat applicants.
- AI-generated interviewer briefing: compares CV claims against GitHub
  evidence, flags concrete discrepancies, and drafts 3-5 targeted follow-up
  questions — written back to the same candidate row.
- Response-time fix: initially the whole enrichment chain ran *before*
  responding to the candidate's browser, which occasionally exceeded the
  frontend's timeout. Rewired so the response fires right after the
  screening decision, with enrichment continuing in the background.
- Added a Header Auth layer + a Global Error Handler workflow (Sheet log +
  email on failure).
- Added the HRD Dashboard (`REC-03` + `hrd-dashboard.html`) so recruiters
  can review AI scores, GitHub tech-stack, and interviewer briefings without
  opening the spreadsheet.

## Known limitations

- The CV-upload webhook's Header Auth key is necessarily visible in the
  frontend's client-side JS (it's a public form) — it filters out
  drive-by bots/scrapers, not a determined actor who reads page source.
- GitHub enrichment covers each candidate's 5 most recently pushed repos —
  a deliberate tradeoff to bound API calls per candidate, not a full account
  audit.
