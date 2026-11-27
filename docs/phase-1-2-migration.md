# Phase 1–2 deployment notes

- Back up the MongoDB database. Stop all backend writers before the DOI migration.
- Configure backend and frontend using their .env.example files. JWT_SECRET must be a new random secret of at least 32 characters; changing it invalidates old sessions.
- From backend, run `npm ci` and `node scripts/migrate-doi-index.js` before starting the new backend. The migration normalizes DOI values, checks for conflicting approved records, replaces the global unique DOI index with an approved-only unique index, and does not delete articles. Resolve any reported conflicts manually; do not run against production without a backup.
- Duplicate pending submissions are permitted. Only one approved original per DOI may exist. A confirmed duplicate must be rejected and link to an approved original. The DOI prefix is not evidence of duplication.
- New automatic IDs are UUIDs; existing custom IDs remain valid.
- Review is a one-way Pending -> Approved/Rejected transition. Notifications are persisted and processed every ten seconds when SMTP is configured, with up to three attempts and increasing retry delays. Moderators may retry failures; interrupted sends require manual confirmation after 15 minutes because SMTP cannot guarantee exactly-once delivery. Disable the worker with NOTIFICATION_WORKER_ENABLED=false.
- The public API returns approved articles only. Submitter and moderator endpoints require the corresponding roles, or Administrator. Article edits and deletions require Administrator.
- My Ratings API, admin dashboard statistics, and full search/ratings improvements are outside these phases.
