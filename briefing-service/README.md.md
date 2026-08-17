# Interviewer Briefing Service

A custom Node.js/Express service that replaces an n8n built-in AI node with a
purpose-built LLM integration featuring **strict output validation** and
**failure-type-differentiated retry logic**. It powers the "generate
interviewer briefing" step of the [AI Recruitment Intelligence
System](../README.md), comparing a candidate's CV claims against their real
GitHub activity and producing a structured discrepancy report for
interviewers.

## Why this exists

The original n8n workflow called Groq's LLM through n8n's built-in AI node.
That worked for demos, but had three reliability gaps at production scale:

1. **No strict validation** — malformed JSON or missing fields from the LLM
   had no clean recovery path.
2. **Generic retry** — n8n retries the whole node the same way regardless of
   *why* it failed (a timeout and a malformed-JSON response were treated
   identically).
3. **No granular error handling** — there was no way to say "if JSON parsing
   fails, retry with a stricter format instruction" versus "if the API
   times out, back off and retry the call."

This service was built to solve those three problems explicitly, not just
replicate what the n8n node already did.

## Architecture

```
n8n (HTTP Request node)
      │  POST /generate-briefing
      │  { cvSkills, cvYearsOfExperience, cvEducation,
      │    githubFound, githubPublicRepos, githubLanguages,
      │    githubFrameworksDetected, githubLastActivity }
      ▼
Express API (server.js)
      │  1. Validate incoming request (Zod) — reject before calling the LLM
      │  2. Check x-api-key header
      ▼
generateBriefing() (step2-structured-output.js)
      │  Calls Groq (llama-3.3-70b-versatile) with response_format: json_object
      │
      ├─ Not valid JSON?        → retry with a stricter format instruction (max 2x)
      ├─ Valid JSON, wrong shape? → retry naming the exact bad field(s) (max 2x)
      └─ API call itself fails?  → retry with exponential backoff (max 3x)
            (timeout / rate limit / 5xx — handled separately from the two above,
             since the cause and the fix are unrelated)
      ▼
{ discrepancy_summary, suggested_questions, overall_risk_score (0-100) }
      ▼
n8n → Google Sheets → HRD Dashboard
```

## Reliability design

| Failure type | Detection | Recovery | Max retries |
|---|---|---|---|
| Malformed JSON | `JSON.parse` throws | Re-prompt: "return ONLY valid JSON" | 2 |
| Schema mismatch | Zod `safeParse` fails | Re-prompt naming the exact field(s) and expected type | 2 |
| API failure (timeout / 429 / 5xx) | HTTP client error | Exponential backoff (1s → 2s → 4s) | 3 |

Each retry type is isolated — a JSON-format retry never triggers a network
backoff, and vice versa, because the correct response to each failure is
different. Every request is logged with the number of attempts and which
retry path (if any) fired, making the reliability improvement observable in
production, not just theoretical.

## Stack

- **Node.js / Express** — HTTP layer
- **Zod** — request validation and LLM output validation
- **Groq API** (`llama-3.3-70b-versatile`) — swappable to Anthropic/OpenAI by
  changing only the API-calling section
- **Vercel** — deployment (serverless, free tier, no credit card required)

## Local development

```bash
npm install
cp .env.example .env   # fill in GROQ_API_KEY and SERVICE_API_KEY
npm run step3          # starts the Express server on localhost:3000
```

## Endpoints

- `POST /generate-briefing` — main endpoint, requires `x-api-key` header
- `GET /health` — uptime check, no auth required

## Environment variables

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Authenticates calls to Groq's API |
| `SERVICE_API_KEY` | Shared secret required in the `x-api-key` header to call `/generate-briefing` |
