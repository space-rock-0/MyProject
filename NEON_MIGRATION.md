# Neon migration status

## Current state

- The `career_ops_trackers` table contains the migrated job and outreach collections (10 jobs and 6 outreach records at migration time).
- The source collections were compared with the database using JSONB equality before the cutover.
- `tracker-store.mjs` uses the Postgres adapter whenever `DATABASE_URL` is set; without it, local development can use JSON files.
- `pg` and `@vercel/functions` are in `package.json` and the lockfile.
- Vercel has `DATABASE_URL` configured for Preview and Production. No deployment has run yet.

## Storage design

The current table stores each tracker as a versioned JSONB collection. Writes use a version check so concurrent edits fail with a retryable error instead of silently overwriting newer data. This keeps the existing API shape intact, but it is not a normalized schema and does not provide foreign keys between jobs, contacts, drafts, and activities.

The tracker data in Neon is durable across Vercel instances and deployments. Other legacy application state, generated reports, and Gmail OAuth tokens are not covered by this migration.

## Deployment configuration still required

- Add `GROQ_API_KEY` and `PD_GROQ_API_KEY` to Vercel for the app and Personal Drafter features.
- Set `PD_GOOGLE_REDIRECT_URI` to the deployed callback URL and add the same URL to the Google OAuth client.
- Move Gmail OAuth token persistence off the function filesystem before relying on Gmail connect across deployments.
- Confirm tracker CRUD and analytics against a Vercel preview after the source changes are pushed.

Keep `DATABASE_URL` server-only. Do not use a `NEXT_PUBLIC_` name for it.
