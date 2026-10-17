# Secure Dashboard / Account Onboarding — Implementation and QA

**Date:** 2026-10-17  
**Branch:** `build/secure-onboarding-dashboard-20261017`  
**Draft PR:** https://github.com/7eaur/social-publisher/pull/4  
**Reference branch:** `build/phase-03-07-system-without-accounts-20261017`  
**Status:** Secure accountless UI and backend complete to tested scope. **Not production-ready.**

## Features built

### RTL dashboard
A unified original Arabic dashboard inspired by contemporary publishing SaaS software, not a Postiz code or visual asset copy:
- Overview: PostgreSQL-derived metrics, route/readiness cards, recent content.
- Routes: independent channel labels, schedule status, pause action.
- Content library: indexed media types and destination publication counts with text search.
- Weekly calendar: configured publishing times by weekday (not fabricated publish history).
- Accounts: Telegram and Meta onboarding/readiness states without exposing tokens.
- Setup/security: guided source, destination, route binding, weekly publishing rules.
- Encrypted credential forms for Telegram API ID/hash/authorized session and Meta access tokens, plus administrative credential revocation.

### Encrypted server-side onboarding
- `0006_telegram_auth_profile.sql`: encrypted Telegram API hash profile with strict IV/tag constraints.
- `apps/api/src/secret-setup.ts`: transactional encryption and rotation/revocation; changing credentials disables associated routes.
- New authenticated endpoints:
  - `PUT/DELETE /api/setup/telegram/:id/credentials`
  - `PUT/DELETE /api/setup/meta/:id/credentials`
- ADMIN permission is required, in addition to an active HttpOnly session, same-origin check and CSRF token.
- Catalog returns boolean readiness metadata. No raw token/session/key in read endpoints.
- If the master encryption key is absent, credential-save requests fail closed (HTTP 503).
- Secrets are not saved in HTML, browser localStorage, source control, logs or client-side settings.

## Validation

Successful all-green GitHub Actions run: https://github.com/7eaur/social-publisher/actions/runs/39063417964

| Suite | Passed | Failed |
|---|---:|---:|
| HTML/JS UI wiring and secret form contract | 3 | 0 |
| Domain, media, Meta mock and worker unit tests | 34 | 0 |
| PostgreSQL migrations and integration | 12 | 0 |
| Secured administrative HTTP API | 10 | 0 |
| Telegram indexing integration | 4 | 0 |
| **Total** | **63** | **0** |

Strict TypeScript type checking and JavaScript syntax checks also passed.

## Current boundaries and risks

1. **Not a production-ready publisher.** No real Telegram session, private channel or Meta account has been connected, and no social post was sent.
2. Saving a Meta token or Telegram session does not prove its validity, ownership or required publish permission. Source and destination remain disabled.
3. Interactive Telegram phone/OTP authorization, OAuth token acquisition/refresh, Meta review status and safe account verification remain for an authorized environment.
4. Instagram/Facebook album/video completeness, object-storage staging, content processing, idempotent remote reconciliation and recovery from ambiguous results remain to be validated end-to-end.
5. The encryption master key, database URL, application origin, admin bootstrap and login throttle pepper must still be injected from the hosting secret manager. There is no secure self-hosted way to store the master key in the same UI/database it unlocks.
6. Admin MFA, distributed rate limits, key rotation, secrets backup/recovery, proxy HTTPS, dependency vulnerability review and real browser visual/accessibility tests remain production gates.
7. **Repository visibility was reported as PUBLIC during this work**, so it must be reviewed and made Private before any real operational configuration is added, though source code does not contain credentials.
8. No Railway deployment, branch merge or live activation performed.

## Next steps

- Approve and review draft PR #4 after visual testing in a safe local/staging environment.
- Implement real authorization and read-only connection verification; test only with account owner's approval.
- Complete media staging, provider capability validation, token refresh and uncertain-result reconciliation.
- Review administration security and provisioning before a non-production Railway deployment.
- Add approved real account credentials through dashboard UI *only after* the setup and security gates pass.

No credentials are required from the user in this build phase.
