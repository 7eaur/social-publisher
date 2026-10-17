# Architecture — Original Social Publisher

## Primary modules and responsibilities

1. **Domain core:** pure source item classification, schedule evaluation, identity and publish state transition rules. Has no HTTP, databases or provider SDK dependencies.
2. **Application layer:** orchestrates commands and use cases through interfaces; transactional boundaries and permission checks.
3. **Infrastructure adapters:** Telegram history/session, PostgreSQL persistence, Facebook and Instagram APIs, temporary object storage, encrypted credentials, audit/alerts.
4. **API:** authenticated admin endpoints using DTO validation, authorization policy, request IDs, rate limits, and no secrets in responses.
5. **Worker:** separately deployable queue runner; atomic SQL reservation and backoff; unknown publish results are quarantined for reconciliation.
6. **UI:** single dashboard with route isolation; no platform tokens stored in browser localStorage.

## Proposed repository evolution

- packages/core: platform-neutral pure domain (phase 01).
- packages/application: use cases and ports (phase 02).
- packages/database: Prisma schema / migrations and repositories (phase 02).
- packages/providers: external platform adapters, isolated (phases 03, 05).
- apps/api: NestJS HTTP API (phase 02).
- apps/worker: publisher/scheduler ingestion workers (phases 02–04).
- apps/web: Next.js admin interface (phase 07).

The above are intended directories; unimplemented packages are not fake stubs.

## Planned consistency model

- PostgreSQL is the system of record, including schedule claims, canonical Telegram source items, publication destinations, outbox records and remote statuses.
- Unique(source_id, canonical_message_id) protects source item identity; grouping rules handle Telegram album IDs.
- Unique(source_item_id, destination_id) protects destination publication identity.
- Unique(route_id, local_date, local_slot) protects each configured publishing slot.
- Worker transaction atomically claims a due slot and item; delivery intents are persisted before external API calls.
- The remote call is a separate step. Timeouts mean **UNCERTAIN**, not retryable, until reconciled with the remote API or operator.
- Every external API access is behind a provider adapter and an integration test contract.
- Store only media IDs/metadata until just-in-time retrieval. Keep temporary media for a verified safe TTL/lease, then physically remove it.

## Timezone and scheduling

Use IANA timezones and ISO weekdays (Monday=1…Sunday=7); clock slots are strictly 'HH:mm'. Local date + slot is part of the schedule claim identity, including across DST fallbacks. Do not guess a default publishing timezone from server UTC. The phase-01 pure evaluator detects only currently due minute; phase-04 runner must add durable catch-up and anti-race behavior.

## Security boundaries

Secrets are never checked into Git; user sessions and Meta tokens must be protected by deployment secrets and encrypted persistent storage. Never return raw external errors containing tokens. Enforce route-level authorization and database isolation, HTTPS, input validation, payload size limits, logs without PII, admin lockout/rate limits and least-privilege provider scopes. Perform a data privacy and platform ToS review before live source access.

## Postiz reference

Postiz is reviewed for high-level engineering patterns (provider abstraction, queues/workers, isolated frontend/backend, failures). The application is not a fork or derivative by default. Do not copy Postiz source snippets, tests or media. If source copying is proposed later, review its licensing and attribution obligations first.
