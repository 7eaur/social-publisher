# Social Publisher — Product Requirements

**Date:** 2026-10-13  
**Scope:** Original implementation; Postiz is reference-only.  
**Status:** Functional requirements approved in principle, platform edge cases to verify in testing.

## P0 functional acceptance criteria

| ID | Requirement | Acceptance condition |
|---|---|---|
| R01 | Two independent private Telegram sources | No content/source/credential mix between routes |
| R02 | Historical and ongoing indexing | Resume from a persisted checkpoint without double-import |
| R03 | Mixed content with captions and albums | Each source item has a canonical identity and media classification |
| R04 | Telegram as media archive | No mass media downloads and no rewriting or deleting source posts |
| R05 | Separate schedule configuration | Weekdays, IANA timezone, daily cap and slots configurable per route |
| R06 | Daily cadence | Wasl defaults to 1, religious to 4–5 on enabled days; final days/times set later |
| R07 | Automatic scheduling | No manual per-post approval; pause/resume supported |
| R08 | Independent destinations | Facebook/Instagram delivery records and errors are independent |
| R09 | Safe formats | Instagram text-only is SKIPPED_UNSUPPORTED; mixed albums require validation |
| R10 | Duplicate prevention | Unique canonical source item and destination keys plus atomic slot/item reservation |
| R11 | Crash recovery | Worker can safely resume or reconcile after a restart |
| R12 | Unknown external result | Never blindly resubmit after a timed-out publish request |
| R13 | Media lifecycle | Stream on demand, validate sizes/formats, release only after safe completion |
| R14 | Management UI | Route status, queue, schedule, failures and destination status visible |
| R15 | Security | Private secrets, protected admin access, least privilege, audit, rate limiting |
| R16 | Quality | Tests for concurrency, timezone edges, failures, restart and platform errors |

## P1 / future

Telegram failure notifications, enhanced analytics, optional TikTok, and account-specific caption formatting after approval.

## Invariants

- Each source item maps to one route, and each destination has its own publication state.
- A source item must never be automatically posted twice to the same destination.
- No guarantee of external exactly-once publication can be assumed without remote idempotency; unknown outcomes require reconciliation.
- Every schedule slot has a unique route/local-date/local-time claim.
- The count of consumed slots for a local day includes reserved slots to prevent race conditions.
- A missing/incompatible item must not cause fabrication of a social post.
- No source session, OAuth token, temporary media, private channel name or log with secrets is committed to Git.

## Decisions to configure later, not blockers for the core

Exact days/slots/timezone, oldest-first (default) versus priority, Telegram edit/delete behavior, Instagram album conversion rules, media limits/retention, login provider and Meta permission validation. Default caption policy: preserve exactly; no AI rewriting.

## Phase 01 completion standard

Clean original structure, documented architecture and explicit phase gates, deterministic pure-domain tests, verified Git branch/commit and a report. **No claim of full system functionality at this stage.**
