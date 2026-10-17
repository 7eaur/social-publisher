# Social Publisher

Original self-hosted social content distribution system. **Not a Postiz fork**.
Postiz is a read-only reference for architecture, not a code dependency.

## Workflow

The planned platform indexes two distinct private Telegram channels, then
automatically publishes compatible content to the corresponding Facebook Page
and Instagram professional account, each on its own configurable schedule.

## Current implementation: Phase 02

- Typed domain rules (source/destination identities, local-day scheduling, safe
  publishing state transitions, platform compatibility).
- Versioned PostgreSQL tables and checksummed migrations.
- Atomic PostgreSQL outbox and schedule slot reservation (including concurrency,
  unique constraints, lease fencing and uncertainty quarantine).
- Encrypted credential persistence helper (AES-256-GCM), scrypt password
  hashing, opaque database-backed login sessions, CSRF and RBAC rules.
- Fastify admin API with health/readiness, login/logout, user profile, protected
  route listing and protected pause.
- Real PostgreSQL integration tests via GitHub Actions.

**Not implemented:** Telegram ingestion, actual Meta publishing, the
background scheduler/worker runner, media transfer, frontend dashboard,
deployment. Do not interpret passing backend tests as approval for live posting.

## Repository layout

- `packages/core`: pure rules
- `packages/database`: PostgreSQL migrations and transactional repositories
- `packages/security`: authentication and encryption primitives
- `apps/api`: independently testable administrative API
- `docs`: decisions, phases and security review

## Development prerequisites

Node 22.12+, npm, PostgreSQL 15+. There is no Docker requirement in the
application source and no production deployment.

1. Configure secrets through a private environment/secrets manager; use
   `.env.example` **only as a placeholder reference**.
2. `npm install --ignore-scripts`
3. `npm run db:migrate` with a disposable PostgreSQL connection.
4. `npm test` for dependency-free core and security tests.
5. `npm run test:db` and `npm run test:api` **only with a dedicated test DB**:
   the DB suite explicitly TRUNCATEs its tables.
6. `npm run typecheck`.

The admin bootstrap and local API commands require private environment
credentials and are not part of the public test workflow. Do not run these
commands against production until the deployment/security gate is approved.

## Working branches

- `build/phase-01-clean-foundation-20261013`: approved original foundation.
- `build/phase-02-persistence-security-20261013`: ongoing Phase 02.
- `main`: legacy bootstrap, **not** production or a complete app.
- `feature/telegram-publisher-foundation`: superseded reference-only plan.

Do not merge or deploy the draft branches without verifying their phase gates.
