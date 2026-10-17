# Phase 02 — Database / Security / Jobs (in progress)

**Branch:** build/phase-02-persistence-security-20261013  
**Stage:** Backend foundation implemented and under acceptance review; no UI or live publishing.

## Completed or committed

- [x] Versioned PostgreSQL schema for users/sessions, Telegram sources, routes, destinations, source items, schedules, publication intent, outbox jobs, media metadata and audit events.
- [x] SQL migrations using SHA-256 checksum, advisory lock and transaction.
- [x] Transactional outbox and atomic SKIP LOCKED claim/fenced acknowledgement; expired claims quarantined.
- [x] Atomic daily slot and source-item reservation.
- [x] Foreign-key integrity between a Telegram source and its route.
- [x] Password hashing/verification (scrypt), per-user sessions with hashed tokens and CSRF secrets.
- [x] AES-256-GCM credential envelope with context binding, roles/permissions and persistent login throttle primitives.
- [x] HTTP admin API with authenticated sessions, CSRF/origin checks, route RBAC, health/readiness and audit.
- [x] Encrypted credential persistence repository implemented and tested (not yet exposed through a remote-account connection endpoint).
- [x] PostgreSQL integration, HTTP API integration, security and core domain tests running on CI.
- [x] Tested concurrent job/slot claims, expiry quarantine, token revocation, account RBAC and encryption.\n- [ ] Production security hardening including proxy/TLS, distributed throttling, key rotation, backups and remote reconciliation (deployment gate).

## Explicit limitations

None of this is a live/social connected publisher. The login throttle is keyed by HMAC-normalized email for predictable account lockout; supplement with IP/device risk limiting and monitoring on a future authenticated API. Quarantining all expired jobs is intentionally conservative; production will need operational reconciliation, not blind retries. Avoid printing session tokens, encryption keys or passwords in logs.

**Gate:** core Phase 02 acceptance is complete after a passing current-head CI check; production hardening is explicitly deferred to Phase 08. Phase 03 requires user approval. No Railway deployment.
