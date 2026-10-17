# Social Publisher — Execution Plan (From Scratch)

**Approved direction:** Original application; Postiz is a read-only engineering reference.  
**Active implementation branch:** build/phase-01-clean-foundation-20261013  
**Last update:** 2026-10-13  
**Previous Postiz-import plan:** superseded; no upstream import or fork required.

## Engineering process and safety gates

For every phase: write a limited acceptance checklist, implement clean modules, add focused tests, inspect security and edge cases, document the result, and obtain owner confirmation before progressing. Never claim a phase passed without its evidence. Never promise software can have zero defects; reduce risk using gate checks.

## Phase 01 — Foundation and domain (CURRENT)

1. Organize original repository, docs, Git branches and reference-only status.
2. Design modular ports/adapters architecture and persistence boundaries.
3. Implement pure source/platform compatibility, schedule rules, canonical keys and publishing state transitions.
4. Add tests and lightweight validation workflow if GitHub Actions permits.
5. Verify all changes are isolated to the build branch. **Do not connect accounts or deploy.**

**Done when:** branch and files confirmed; domain tests pass; no original Postiz code copied; user reviews report.

## Phase 02 — Persistence, auth and jobs

NestJS HTTP API, Prisma/PostgreSQL schema and migrations, admin login/session hardening, RBAC, encrypted credential storage, content/source/slot/publication tables, transactional outbox, atomic row claiming, health/readiness/audit. Test concurrent claims and rollback. No external publishes.

## Phase 03 — Telegram ingestion

MTProto user-session connector, per-channel permissions and indexing, history pagination, album grouping, edits/deletions policy, bounded concurrency, backoff and checkpoint recovery. Keep source media in Telegram. Test two isolated routes and reconnects.

## Phase 04 — Scheduling and queue worker

IANA timezone daily slots, weekly rules, daily caps, backlog ordering, pause/resume, durable slot claims, reconciliation of missed slots and restart safety. Exercise local day boundaries, DST, concurrency and source depletion.

## Phase 05 — Real Meta publishing adapters

OAuth for Facebook Pages and Instagram professional accounts, scoped token refresh/storage, capability checks, explicit compatible content handling, preview/dry-run, remote acknowledgement tracking and uncertain-result reconciliation. Live approval tests with authorized test accounts only.

## Phase 06 — Temporary media lifecycle

On-demand fetch/stream, content-type and size verification, safe HTTPS staging for Meta, expiry leases, garbage collection, storage quotas, provider processing status and post-cleanup audit.

## Phase 07 — Management UI / operation

Next.js admin dashboard, connect sources/destinations, schedules, queue, status/errors, retries only when provably safe, pause/resume, alerts and event logs. Arabic-friendly RTL design.

## Phase 08 — Hardening and deployment

Security review, integration/E2E and fault injection, performance and cost measurements, backups and recovery, staged Railway deploy, final acceptance then separately authorized production activation.

## Architectural decisions

See docs/architecture/ARCHITECTURE.md and docs/decisions/ADR-0001-original-system.md.

## Current repository state

- 'main' is an earlier bootstrap and is not a runnable Postiz application.
- 'feature/telegram-publisher-foundation' retains historical plans based on importing Postiz; do not follow them.
- The current build is isolated on 'build/phase-01-clean-foundation-20261013'.
- Until stage acceptance, leave 'main', original branches and Railway unchanged.
