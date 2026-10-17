# Social Publisher

A clean original self-hosted social publishing system. **Postiz is a reference for architecture and product UX, not an imported codebase or runtime dependency.**

## Intended workflow

Two separate authorized Telegram private channels provide a durable content backlog. Each can be assigned distinct Facebook Page / Instagram Professional destinations, a timezone-aware weekly schedule, and an automatic publishing policy. Originals stay on Telegram; staged media is temporary.

## Current implementation

- **Domain** — canonical source identities, platform compatibility, schedule rules, publication states.
- **PostgreSQL** — migration history, inbox/outbox, deduplication, locks, schedules, media metadata and encrypted credential columns.
- **Security** — scrypt passwords, user sessions, CSRF, account roles, audit, AES-256-GCM secret envelopes.
- **Source** — Telegram history/session abstractions and accountless indexing tests.
- **Publishing** — offline queue, scheduler and partial Meta adapters with strict live-publish gate.
- **Media** — bounded streaming and temporary retention foundation, not a full live staging pipeline.
- **Admin UI** — responsive Arabic RTL dashboard with overview, routes, queue/search, weekly planner, accounts, schedule configuration and encrypted credentials forms.

**No live accounts or sessions have been configured, no social posts have been sent, and no Railway deployment has occurred.**

## Onboarding from the dashboard

Once the server is provisioned securely, an administrator can add a Telegram source draft, add Meta account drafts, link routes, configure schedules, then enter Telegram API ID / API hash / pre-authorized session or Meta access tokens using the **encrypted credential forms**. Secrets are never echoed back by GET endpoints. Replacing/revoking them disables the affected route.

**Saving is NOT activation or verification.** Live publication remains disabled pending end-to-end platform authorization, source permissions, stage-media support, outcome reconciliation and approval.

An installation-bound encryption master key, database URL, app origin and initial admin provisioning must be supplied through hosting secrets, never through the same dashboard.

## Branches

- `build/phase-01-clean-foundation-20261013`: foundation.
- `build/phase-02-persistence-security-20261013`: PostgreSQL and admin security.
- `build/phase-03-07-system-without-accounts-20261017`: accountless system foundations.
- **`build/secure-onboarding-dashboard-20261017`**: current original RTL dashboard + encrypted onboarding.
- `main`: legacy bootstrap; NOT deployable.

## Quality gates

Run Node 22.12+ with a disposable PostgreSQL 15 test database named `*_test` and `NODE_ENV=test`. Do not point test suites to production databases.

```bash
npm install --ignore-scripts
npm run typecheck
npm run test:web:syntax
npm run test:web:contract
npm test
npm run test:db
npm run test:api
npm run test:telegram:db
```

CI evidence and known limitations: [Secure dashboard report](docs/qa/SECURE_DASHBOARD_REPORT_2026-10-17.md) and [secret onboarding policy](docs/security/SECRET_ONBOARDING.md).

**Do not deploy or enable live publishing without review.**
