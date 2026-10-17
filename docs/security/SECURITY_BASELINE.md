# Security Baseline — Social Publisher

**Scope:** Security requirements and phase gates for an original project; **not an audit or proof of production security**.

## Assets and threats

| Asset | Threat | Control to implement and test |
|---|---|---|
| Telegram MTProto session | Account hijack or cross-route access | Secure session encryption at rest; never print session strings; revoke/reconnect path |
| Meta OAuth tokens | Unauthorized publishing | Encrypt at rest, least scopes, rotation/reconnect, restricted API responses |
| Private channel content | Leakage into wrong account | Explicit source-to-route-to-destination linkage and authorization tests |
| Publishing queue | Duplicate post from crash/races | Unique DB constraints, atomic claim, reconcile uncertain remote outcomes |
| Temporary media | Permanent copies or exposed private files | HTTPS limited-time access, maximum size/TTL, deletion, orphan cleanup |
| Admin users | Unauthorized configuration | Secure session cookies, CSRF defense, RBAC, MFA option, rate limits and audit log |
| Media retrieval | SSRF/DoS or oversized content | Strict allowlists, MIME/content sniffing, stream size caps, bounded concurrency |
| Worker | Leaks or malicious state changes | Separate least-privilege service credentials, no automatic blind retry |
| CI / GitHub | Credential theft | Read-only CI, no secrets in PR jobs, pinned dependencies, no build-time publish |

## Non-negotiable release checks

1. Credentials and media never committed to Git. `.env.example` holds placeholders only.
2. All external data validated before entering domain logic and before storage/media processing.
3. No anonymous mutating API endpoints. Cross-route access controlled at both application and persistence layers.
4. Failed/unknown publish outcomes are represented separately, with explicit reconciliation.
5. Database transactions enforce idempotency and at-most-one slot/item claim under concurrency.
6. Secrets are redacted from errors/logs; audit events include identity, action and time but not raw tokens.
7. Backups/restores and migration rollback tested before live publishing.
8. Meta permissions, Telegram access and compliance with platform rules checked before using real accounts.
9. Authenticated UI requires HTTPS, secure cookies and CSRF/origin controls.
10. Security review and failure drills required before deployment.

## Phase 01 reality

There are **no HTTP endpoints, credentials, runtime Telegram sessions, cloud storage accounts, deployed services or live social API calls**. Current security tests cover domain inputs, idempotency identity structure, local-day schedule keys and forbidden publication-state transitions. They do not replace future infrastructure security work.
