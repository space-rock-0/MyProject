# Personal drafter

Open `/drafter` in the main Next.js app. A separate Python server is not required.

The web app uses `../personal_drafter/Personal Drive/` when that folder exists:

- `01_Templates/Email_Templates.txt`: four `## Template N — Title` sections.
- `01_Templates/LinkedIn_Templates.txt`: five `## N. Title` sections, optional Stage and Personalization lines.
- `01_Templates/Cover_Letter_Template.txt`: header, `[DATE]`, greeting, body and closing.
- `02_Resume_Data/Master_Resume_Data.txt`: factual resume context.
- `03_Resume_PDFs/Resume_AI.pdf`, `Resume_ML.pdf`, `Resume_SDE.pdf`, `Resume_FDE.pdf`: attachments.

Profile details come from `../personal_drafter/profile.json`. Changes to template files are read on the next request. The previous `web/data/personal-drafter` layout remains supported. To choose another directory, set `PD_DATA_DIR`; this directory must include `profile.json` and either the numbered structure above or the previous layout.

Configure `PD_GROQ_API_KEY` and optionally `PD_MODELS` in `web/.env`. Restart after changing environment settings. Credentials and Gmail tokens remain in `web/data/personal-drafter` by default; `PD_DATA_DIR` also overrides that location. Set `PD_GOOGLE_REDIRECT_URI` to the exact callback registered with Google, such as `http://localhost:3000/auth/google/callback`.

Gmail authorization is checked with a temporary state cookie. Draft creation happens only when you click Create Gmail draft. New tracker rows use INBOX; sending the email and marking it APPLIED are manual actions. If tracker saving fails after Gmail succeeds, the response includes the Gmail link and a warning so you can avoid creating a duplicate draft.

Run `node tests/personal-drafter-smoke.mjs` from `web` for a generation check using a mock provider. It makes no network calls and writes no personal data. Actual Groq and Gmail operations require valid credentials and a manual live check.

Form inputs are saved in this browser. This change does not add database sync or make filesystem storage durable on Vercel.
