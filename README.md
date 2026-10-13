# Social Publisher

A new, private, self-hosted social content publishing project. **This is original source code, not a Postiz fork.**

## Goal

Ingest content from two private Telegram channels (Wasl Tech and religious content), schedule each stream independently, and publish to its connected Facebook Page and Instagram professional account. The owner's Telegram messages remain the source media archive.

Postiz (https://github.com/gitroomhq/postiz-app) is a **read-only architectural reference** for separation of concerns, scheduling, provider adapters and failure recovery. Its source tree, code and Git history are **not** included.

## Status

**Phase 01: architecture and pure domain core only.** There is no running API, Telegram integration, database, Meta publishing, admin UI or deployment yet. Do not put real tokens in this repository.

## First-phase structure

- packages/core/src: pure domain rules, publishing state transitions and canonical keys.
- packages/core/test: deterministic unit tests for the critical invariants.
- docs/architecture: adapters, persistence boundaries and technical decisions.
- PROJECT_OVERVIEW.md / REQUIREMENTS.md / IMPLEMENTATION_PLAN.md: agreed product and stage gates.

## Prerequisite and tests

Node.js 22.12+ (major version 22). For phase 01's dependency-free unit tests:

    npm test

For later type checking after installing developer dependencies:

    npm install --ignore-scripts
    npm run typecheck

No `.env` secrets are required to test the domain core. Do not deploy Phase 01.

## Branch policy

The active independent build branch is 'build/phase-01-clean-foundation-20261013'. Existing 'main' and the older 'feature/telegram-publisher-foundation' are historical bootstrap/docs; do not confuse them with the new application. The integration into 'main' is a separate approval gate.
