# ADR-0002 — PostgreSQL schema and transactions as source of truth

**Date:** 2026-10-13  
**Status:** Approved implementation detail for Phase 02.

The earlier rough plan listed Prisma ORM; in the actual implementation we use
versioned, checksummed SQL migrations and the official `pg` client directly.
The critical workload (unique source/destination keys, Postgres row locks,
durable outbox, and transactionally consistent daily quotas) needs explicit
PostgreSQL semantics. A second ORM schema would duplicate definitions and
increase migration drift risks for this small application.

Requirements:
- Every migration is immutable; changes require a new numbered SQL migration.
- Migrations are serialized with a PostgreSQL transaction advisory lock.
- All application queries use parameters for data values.
- Idempotency must be enforced by database UNIQUE constraints, not just JS keys.
- The worker never automatically retries an expired ambiguous external request.
- Keep connection pooling bounded; secrets never appear in logging.
- Production transport must validate the DB server identity.
- Add real PostgreSQL integration tests in CI; unit tests alone are insufficient.

This decision does not change the from-scratch architecture or the Telegram/Meta
requirements; it replaces Prisma with fewer moving parts.
