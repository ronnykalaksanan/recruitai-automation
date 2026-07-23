# 🤖 RecruitAI — AI-Powered HR Recruitment Automation

> Automated candidate screening system built with n8n + Groq AI. From PDF upload to AI evaluation to email notification — fully automated.

![n8n](https://img.shields.io/badge/n8n-Automation-orange) ![Groq](https://img.shields.io/badge/Groq-AI%2FLLM-blue) ![Google Sheets](https://img.shields.io/badge/Google%20Sheets-Data-green) ![Gmail](https://img.shields.io/badge/Gmail-Email-red) ![Slack](https://img.shields.io/badge/Slack-Notifications-purple)

---

## 📋 Overview

RecruitAI is a fully automated recruitment system that eliminates manual CV screening. HR teams simply set up a job posting — candidates upload their CV, and the system handles everything else automatically.

---

## ✨ Features

- 📄 **PDF CV Upload** — Candidates upload CV directly from the web interface
- 🧠 **AI Data Extraction** — Automatically extracts name, skills, experience, education from CV text
- 🎯 **Smart Matching** — AI matches candidate profile against specific job requirements
- 📊 **AI Scoring** — Generates score (0-100), strengths, weaknesses, and recommendation (SHORTLIST / HOLD / REJECT)
- 📧 **Automated Emails** — Sends personalized HTML email — interview invitation or rejection notice
- 📋 **Dynamic Job Postings** — Job listings managed via Google Sheets, no code changes needed
- 📊 **Audit Trail** — All results logged to Google Sheets automatically
- 🚨 **Error Handling** — Dedicated error handler with Slack + Gmail notifications

---

## 🛠️ Tech Stack

| Tool | Purpose |
|---|---|
| **n8n** | Workflow orchestration |
| **Groq (LLaMA)** | AI/LLM inference |
| **Google Sheets API** | Data source + logging |
| **Gmail API** | Automated email notifications |
| **Slack API** | Team alerts |
| **HTML/CSS/JS** | Frontend application |

---

## 🔄 System Architecture

```
Frontend (HTML/JS)
      │
      ├── GET /webhook/get-job-posting ──→ Google Sheets (Job Postings)
      │
      └── POST /webhook/cv-screening
                │
                ├── Extract Text from PDF
                ├── AI: Extract Candidate Data (Groq)
                ├── AI: Screen & Match Requirements (Groq)
                ├── Log to Google Sheets
                ├── Route by Recommendation (IF node)
                │     ├── SHORTLIST → Send Interview Invitation Email
                │     └── REJECT/HOLD → Send Rejection Email
                └── Return Result to Frontend
```

---

## 📁 Project Structure

```
recruitai-automation/
├── frontend/
│   └── hr-recruitment.html          # Web interface
├── workflows/
│   ├── cv-screening.json            # Main screening workflow
│   ├── get-job-posting.json         # Job posting endpoint
│   └── error-handler.json           # Error handling workflow
├── docs/
│   └── architecture.png             # System diagram
└── README.md
```

---

## 🚀 How It Works

**1. Job Posting Setup**
Add job details to Google Sheets (company name, position, requirements, salary, facilities). Set status to `active` — frontend loads it automatically.

**2. Candidate Applies**
Candidate visits the web interface, sees the job posting, and uploads their CV in PDF format.

**3. AI Processing**
- n8n receives the PDF via webhook
- Extracts text from PDF
- Groq AI extracts structured candidate data
- Groq AI evaluates candidate against job requirements
- Generates score, strengths, weaknesses, recommendation

**4. Automated Actions**
- Result returned to frontend instantly
- Personalized email sent to candidate automatically
- All data logged to Google Sheets for HR review

---

## ⚙️ Setup

### Prerequisites
- n8n instance (cloud or self-hosted)
- Groq API key (free at console.groq.com)
- Google account (for Sheets + Gmail)
- Slack workspace (for notifications)

### Installation

1. **Import workflows** — Import all JSON files from `/workflows` into your n8n instance
2. **Setup credentials** in n8n:
   - Google Sheets OAuth2
   - Gmail OAuth2
   - Slack Bot Token
   - Groq API Key
3. **Create Google Sheets**:
   - `Job Postings` sheet with columns: job_id, company_name, company_about, position, work_type, salary_min, salary_max, salary_currency, salary_period, jobdesk, facilities, requirements, status
   - `Error Log` sheet with columns: Timestamp, Workflow, Error, URL
   - `Candidate Log` sheet for screening results
4. **Update webhook URLs** in frontend HTML
5. **Publish workflows** in n8n
6. **Open frontend** in browser — ready to use!

---

## 🔮 Roadmap

### V2 (Planned)
- [ ] GitHub profile analysis for technical candidates
- [ ] AI-generated interview question list for HR
- [ ] Multi-job posting with job selector
- [ ] Database integration (Supabase/Airtable)
- [ ] Duplicate application detection
- [ ] OCR support for scanned CVs
- [ ] HR admin dashboard

### V3 (Future)
- [ ] Weekly performance report automation
- [ ] Monthly AI evaluation & quality monitoring
- [ ] Latency monitoring & alerts
- [ ] Error rate dashboard

---

## 📜 License

MIT License — feel free to use and modify for your own projects.

---

## 👤 Author

**Ronny Ardiansyah Kalaksanan**
- Upwork: [ronny_kal](https://www.upwork.com/freelancers/~018d6203abdbcb1d56?mp_source=share)
- Fiverr: [ronny_kal](https://www.fiverr.com/sellers/ronny_kal)
- LinkedIn: [Ronny Ardiansyah Kalaksanan](https://www.linkedin.com/in/ronnykalaksanan/)

---

*Built with n8n + Groq AI · Certified n8n Foundations Developer (N8N101, N8N102, N8N103)*
