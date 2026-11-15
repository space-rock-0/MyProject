# Data connectivity audit

Add Job and Job Tracker both write `DATA_DIR/job-tracker.json`. Personal Drafter adds a job after Gmail draft creation. Add Outreach and Outreach Tracker both write `DATA_DIR/outreach-tracker.json`. Tracker analytics reads those same files. Personal drafter inputs remain browser-local.

## Corrected

- Tracker and bulk import readers reject non-array JSON instead of replacing it with an empty table.
- Tracker create/update endpoints accept only known text fields and trim values. Dates are validated, IDs must be positive integers, and deleting a missing record returns 404.
- Outreach bulk import skips repeated company/role/contact/channel combinations.
- Follow-ups due excludes future dates.
- Company-based outreach coverage counts jobs at contacted companies rather than dividing unrelated contact and job totals.
- Funnel description identifies the calculation as an estimate from current statuses, not historical transitions.

## Remaining integrity gaps

1. JSON read/modify/write has no transaction shared across processes. Atomic rename does not prevent lost updates. Shared temporary filenames also permit competing writers to interfere. Vercel filesystem storage is not a durable production database.
2. IDs use maximum existing ID plus one and can be reused after deletion. There are no foreign keys between jobs, contacts, drafts and activities.
3. Job import deduplication, manual creation and Gmail insertion use different rules. Repeating Gmail draft creation can create another remote draft; a timeout cannot establish whether Google saved it.
4. Tracker screens do not consistently check HTTP failure before closing editors. Full-row updates have no revision check, so stale edits can overwrite newer changes.
5. There is no status transition history. Rejected records lose their previous funnel stage. Company matching for coverage is a heuristic, not a relational join.
6. Other core pipeline/report features use separate legacy data sources. The two JSON trackers are not a universal source of truth for the entire application.

## Database migration target

Use PostgreSQL tables for jobs, contacts, outreach activities, drafts and job status events. Give each record a stable ID and revision, link activities and drafts with foreign keys, and record timestamps. Put all create/update/delete operations behind a shared repository. Use transactions, explicit deduplication keys, optimistic concurrency (409 on stale revision), and idempotency keys for external operations. Preserve original data during import and compare source/destination record counts before switching reads. Backups require a tested restore procedure; they are not protection against every failure.

This audit did not create a database or migrate records. TypeScript checking passed after the targeted fixes. Production persistence and end-to-end CRUD verification remain outstanding.
