# Phase 01 — Foundation Review

**Date:** 2026-10-13  
**Repository:** 7eaur/social-publisher (private)  
**Development branch:** build/phase-01-clean-foundation-20261013  
**Status:** Code/domain gate passed; awaiting owner review, no merge or deployment.

## Completed work

- Pivoted away from importing/forking Postiz: independent TypeScript project with Postiz as read-only architecture reference.
- Rewrote PROJECT_OVERVIEW.md, REQUIREMENTS.md, IMPLEMENTATION_PLAN.md; added architecture and engineering ADR.
- Set up workspace, Node engine expectation, strict TS configuration, ignore rules and placeholder environment file.
- Added independently testable, dependency-free package 'packages/core':
  - source item identity keys
  - publication/destination identity keys
  - per-route timezone-aware due-slot candidate
  - compatibility candidate rules (Facebook/Instagram)
  - explicit publishing state transition guard, including quarantine of unknown outcomes
- Added low-privilege GitHub Actions checks.

## Test evidence

**GitHub Actions run:** https://github.com/7eaur/social-publisher/actions/runs/38441910490

Workflow on commit '38f39c2d6f9af93f0f76fd5a6e136403f6a195f8':
- Node 22 pure-domain unit tests: **16 passed, 0 failed**.
- Strict TypeScript typecheck: **passed**.
- No deployment actions and no real credentials.

## Limitations

- This is **not a runnable publishing service**. No database, Telegram ingestion, Meta integration, auth, scheduler worker, UI, or Railway deployment exists yet.
- The due-slot function only evaluates the current local minute; transactionally claimed slots and missed-slot catch-up belong to Phase 04.
- Provider compatibility is an initial eligibility filter, NOT a promise that media meets Meta API constraints.
- String keys do not enforce physical deduplication without future unique SQL constraints.
- "UNCERTAIN" state requires remote reconciliation before retry; reconciliation is not yet implemented.
- There is no claim that all errors or security flaws have been eliminated.

## Branch safety

Only the build branch is changed. Earlier import plans remain historical in their older branch. 'main' has not been merged, rewritten or deployed. No Postiz files, secrets or tokens were copied.

## Next gate (do not start without user confirmation)

Phase 02: design and implement PostgreSQL schema/unique indexes, authentication and transactionally safe outbox/claim worker, then add concurrency and negative-path tests. No real Meta/Telegram publishing during Phase 02.
