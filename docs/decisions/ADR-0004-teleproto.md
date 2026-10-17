# ADR-0004 — Maintained Telegram MTProto client

**Date:** 2026-10-17

The original GramJS (`telegram`) package is archived/deprecated. For future
authorized session connections this project pins `teleproto` v1.230.1, the
actively maintained successor with a largely compatible client API.

The source connector remains behind a narrow `TelegramHistoryPort`.
Creating an authorized connection requires encrypted session data plus an
explicitly approved channel peer ID; no credential is in repository or CI.
The database session is encrypted via AES-256-GCM and bound to source identity.
No phone login, SMS/verification bypass or account connection occurs during this
offline implementation.

Before deployment validate session reauthentication, entity/access-hash
resolution, flood-wait handling, channel access, and rate limits with the user.
