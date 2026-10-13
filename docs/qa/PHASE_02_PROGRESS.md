# Phase 02 — Database / Security / Jobs (in progress)

**Branch:** build/phase-02-persistence-security-20261013  
**Gate:** Do not merge/deploy or start Telegram ingestion until acceptance.

## Planned deliverables and evidence

1. [x] Versioned PostgreSQL schema for users/sessions, sources, routes, destinations,
   source items, schedules, claims, publications, outbox, temporary media and audit events.
2. [x] Transactional migration runner with checksum protection.
3. [x] Job enqueue + atomic SKIP LOCKED claim; safe acknowledgement, quarantine of expired leases.
4. [x] Atomic reservation of scheduling quota and source-item/slot uniqueness.
5. [ ] Authenticated API with RBAC, secure sessions and encrypted provider credentials.
6. [ ] PostgreSQL integration tests proving concurrency, uniqueness and migrations.
7. [ ] Security/quality review, tests, updated acceptance report.

No live channel credentials, tokens, Meta posts, Railway deployment or media staging.
