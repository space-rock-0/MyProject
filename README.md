# Personal Drafter

Local app that drafts emails, LinkedIn messages, form answers and cover letters from your own templates and resumes, using Groq. Emails go into Gmail as drafts with the best-matching resume PDF attached. It never sends anything on its own.

## Setup (10 minutes)

1. Install: `pip install -r requirements.txt` (Python 3.10+)
2. Groq key: copy `.env.example` to `.env`, paste your key from https://console.groq.com/keys
3. Gmail (one time):
   - Google Cloud Console: create a project, enable **Gmail API**
   - OAuth consent screen: External, status Testing, add your own Gmail as a **test user**
   - Credentials: Create OAuth client ID, type **Desktop app**, download the JSON, save it here as `credentials.json`
4. Run: `python run.py`, then open http://localhost:8000 (use `localhost`, not `127.0.0.1`)
5. Click **Connect** under Gmail in the left rail.

Permission requested is `gmail.compose` only. It cannot read your inbox. This app only creates drafts.
While the Google app is in Testing, the Gmail login expires every 7 days. Click Connect again.

## Your files (Personal Drive/)

| File | Used for |
|---|---|
| `Email/Email Template.txt` | 4 templates, chosen by "Writing to" |
| `Linkedin/Linkedin Template.txt` | 5 stages, chosen by "Message type" |
| `CV/CV TEMPLATE.txt` | Cover letter |
| `Resumes/Resume combiined.txt` | Source of truth for facts. Edit this to change what the model knows |
| `Resume_org/*_ai/ml/sde/fde.pdf` | Attachments. Name must end in `_<key>.pdf` |

Keep the `## Template N - title` and `## N. title` headings in the template files; the loader splits on them. The `{INPUT}/{OUTPUT}` notes are stripped before the model sees them. Your signature comes from `profile.json`, not from the model.

## How it works

- Resume choice is keyword scoring on job title + JD. No LLM call, zero tokens. Override it in the Resume dropdown.
- Email, LinkedIn, cover letter send a trimmed resume (~2k tokens): profile for the chosen role, all experience, skills, best-matching projects.
- Form answers send the full resume (~4.4k tokens) because questions are open-ended.
- Anything it cannot know (notice period, salary, relocation) comes back as `[FILL: needs your input]`.

## Groq free tier

Tokens per minute (input + output) is the real limit, not the context window. Sample free-tier limits were about 8,000 tokens/min and 200,000 tokens/day per model when this was built; check console.groq.com for yours. The app retries short waits and falls through `GROQ_MODELS` in order. Limits are per model, so a second model adds headroom.
