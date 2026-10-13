# ADR-0001 — Original implementation rather than Postiz fork

- **Date:** 2026-10-13
- **Status:** Accepted for Phase 01
- **Context:** Original Postiz has many features unnecessary for two automated Telegram-to-Meta routes; upstream workflow permissions also blocked importing the whole tree into the private repo.

## Decision

Develop an original, smaller system. Adopt architecture principles rather than copying Postiz source. Use TypeScript domain core (Node 22), later NestJS API + Prisma/PostgreSQL + background worker + Next.js UI.

Use a **PostgreSQL transactional outbox with locked/leased workers** first. Do not require Temporal or Redis without evidence of need. Explicit idempotency and reconciliation are required regardless of queue technology. Keep the option of Temporal/Redis for future scaling only after measurements justify them.

## Consequences

- We own provider and scheduling integration code and must test Meta/Telegram changes.
- Lower planned infrastructure surface area, but correctness work cannot be omitted.
- Phase 01 consists only of portable domain rules/tests; API, real accounts and deployments are separate phase gates.
- Postiz upstream AGPL-3.0 should be evaluated separately if code reuse is ever proposed; no files or source code are copied at foundation stage.
