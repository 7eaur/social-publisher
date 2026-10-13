# Phase 02 — Database / Security / Jobs (in progress)

**Branch:** build/phase-02-persistence-security-20261013  
**Stage:** Database transactions + initial security primitives; API/login UI not yet complete.

## Completed or committed

- [x] Versioned PostgreSQL schema for users/sessions, Telegram sources, routes, destinations, source items, schedules, publication intent, outbox jobs, media metadata and audit events.
- [x] SQL migrations using SHA-256 checksum, advisory lock and transaction.
- [x] Transactional outbox and atomic SKIP LOCKED claim/fenced acknowledgement; expired claims quarantined.
- [x] Atomic daily slot and source-item reservation.
- [x] Foreign-key integrity between a Telegram source and its route.
- [x] Password hashing/verification (scrypt), per-user sessions with hashed tokens and CSRF secrets.
- [x] AES-256-GCM credential envelope with context binding, roles/permissions and persistent login throttle primitives.
- [ ] HTTP admin API with mandatory authenticated sessions, CSRF/origin control, route RBAC, health/readiness and audit.
- [ ] Wire secret storage/credentials into authenticated persistence API.
- [ ] Verify real PostgreSQL integration tests and security tests all green.
- [ ] Re-review concurrency, token revocation, lockout and disconnect handling.

## Explicit limitations

None of this is a live/social connected publisher. The login throttle is keyed by HMAC-normalized email for predictable account lockout; supplement with IP/device risk limiting and monitoring on a future authenticated API. Quarantining all expired jobs is intentionally conservative; production will need operational reconciliation, not blind retries. Avoid printing session tokens, encryption keys or passwords in logs.

**Gate:** cannot close Phase 02 until a protected admin API, tests and security review pass. No Railway deployment.
