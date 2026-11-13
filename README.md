# Career-ops — Job Search Application

A personal job-search web application: job tracker, outreach tracker, AI job/outreach
capture, and a Personal Drafter (emails, LinkedIn messages, form answers, cover letters)
with Gmail integration.

Local-first app. Single `.env`, runs anywhere Node runs.

## What's inside

- **Today** (`/`) — your action queue: interviews, assignments, follow-ups
- **Job Tracker** (`/job-tracker`) — pipeline with status tabs
- **Outreach** (`/outreach`) — contact table with follow-up tracking
- **Add Job** (`/add-job`) — paste free text, Groq parses it into the tracker
- **Analytics** (`/analytics`) — funnel and conversion metrics from your data
- **Drafter** (`/drafter`) — email / LinkedIn / form answers / cover letter,
  picks the best resume, creates Gmail drafts (needs `credentials.json` + OAuth)

## Environment

Copy `.env.example` to `.env` and fill it in:

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | App's Groq key (assistant, Add Job, Outreach) |
| `GROQ_MODEL` | Model for the app (default `openai/gpt-oss-120b`) |
| `PD_GROQ_API_KEY` | **Personal Drafter's** separate Groq key |
| `PD_MODELS` | Drafter models, tried in order |
| `PD_GOOGLE_REDIRECT_URI` | Gmail OAuth callback; defaults to `<origin>/auth/google/callback` |
| `CAREER_OPS_DATA_DIR` | Optional. Where `job-tracker.json` / `outreach-tracker.json` live. Default `./data` |

Personal Drafter reads its own data folder at `./data/personal-drafter`
(templates, combined resume, role-specific resume PDFs, `credentials.json`, `token.json`).
Those files are yours — they are git-ignored by default except `personal-drafter`
templates/resume files which **must** be present at deploy time (see below).

## Run locally

```bash
npm ci
npm run build
npm start        # http://localhost:3000
```

## Deploy on Render

1. Push this repo to GitHub (already wired to `space-rock-0/MyProject`).
2. In Render: **New → Web Service**, connect the repo.
   - **Runtime**: Node
   - **Build command**: `npm ci && npm run build`
   - **Start command**: `npm start`
   - **Instance type**: Free works; data on free tier is ephemeral (lost on every redeploy) — upgrade to Starter + persistent disk if you want durable data.
3. **Environment variables** (copy from `.env.example`, paste real values):
   `GROQ_API_KEY`, `GROQ_MODEL`, `PD_GROQ_API_KEY`, `PD_MODELS`,
   `PD_GOOGLE_REDIRECT_URI=https://<your-service>.onrender.com/auth/google/callback`
4. **Secret Files** (Render dashboard → Secret Files):
   - `credentials.json` — Google OAuth client (Gmail API, Desktop app or Web app)
   - `token.json` — created automatically after first Gmail connect
5. Deploy. Render sets `PORT`; `server.mjs` binds `0.0.0.0` in containers and allows only the service hostname plus loopback — callbacks land at `/auth/google/callback`.

## Gmail one-time setup

1. Google Cloud Console → create project → enable **Gmail API**
2. OAuth consent screen → External → Testing → add your Gmail as test user
3. Credentials → **OAuth client ID** → Web application
   - Authorized redirect URIs: `https://<your-service>.onrender.com/auth/google/callback`
4. Download client JSON → save as `credentials.json` into `data/personal-drafter/`
5. In the app: Drafter → Connect Gmail → sign in. `token.json` is written into
   `data/personal-drafter/`.

## Notes

- Free tier Gmail tokens from Testing-mode apps expire every 7 days — reconnect when asked.
- Job tracker and outreach data are plain JSON files; back up `data/` regularly.
