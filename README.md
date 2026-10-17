# Social Publisher

Original self-hosted Telegram → Facebook / Instagram publishing platform, developed in stages. Postiz is an engineering reference, **not a source-code dependency**.

## Current status

Domain core and PostgreSQL/security/Fastify administration foundations exist. A testable Telegram-history ingestion boundary is being added without connecting accounts or channels. **There is no working Telegram account connection, production scheduler, Meta publishing adapter, media staging or web dashboard yet.**

## Modules

- `packages/core`: identity keys, timezone/slot policy, publication state rules
- `packages/database`: schema, migrations, outbox and transactional claims
- `packages/security`: sessions, credentials and RBAC
- `packages/telegram`: Telegram history boundary, classification and checkpoint persistence
- `apps/api`: limited authenticated administration API
- `docs`: ADRs and phase results

## Tests

Node 22.12+, PostgreSQL 15. Use a dedicated disposable test database only for integration tests.

```bash
npm install --ignore-scripts
npm test
npm run typecheck
npm run test:db
npm run test:api
```

Live sessions, channels and passwords are added only after implementation and review, never in Git.
