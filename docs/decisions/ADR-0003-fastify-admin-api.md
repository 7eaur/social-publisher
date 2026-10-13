# ADR-0003 — Minimal strict admin HTTP API

**Date:** 2026-10-13  
**Status:** Accepted for Phase 02

We use Fastify v5 for the original management API instead of the initially
proposed NestJS. The scope is deliberately small. Separating HTTP handlers
from domain, PostgreSQL and security packages makes testing easier.

Sessions: scrypt password hashes; 256-bit random opaque session tokens stored
only as SHA-256 hashes; per-user revocation; CSRF token hashing; SameSite Strict
and HttpOnly cookies (Secure and __Host- prefix in production); exact
same-origin validation for mutating requests; PostgreSQL account lockout;
least-privilege roles and audit events.

Route read/pause and live/readiness are the only application-facing endpoints.
There are no Telegram or Meta integrations, token entry forms, or publishing
operations in this API stage.

Before public deployment, validate edge/proxy HTTPS, distributed IP throttling,
rotation and recovery workflows, permission denial tests, backup/restore,
dependency locking, and operational monitoring. Worker/provider calls must run
outside HTTP request handlers.
