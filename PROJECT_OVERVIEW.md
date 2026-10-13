# Social Publisher — Project Overview

**Date:** 2026-10-13  
**Decision:** Build an original, narrowly scoped system from scratch.  
**Repository:** 7eaur/social-publisher (private).  
**Architecture reference only:** https://github.com/gitroomhq/postiz-app  
**Status:** Phase 01 in progress; no production system exists.

## Product

A single self-hosted platform with one admin interface, separate background workers and independent publishing routes. Telegram is the source of truth for original content and media; the system indexes only necessary metadata and retrieves media on demand.

| Publishing route | Input | Destinations | Proposed daily cadence |
|---|---|---|---|
| Wasl Tech | Private Telegram channel | Facebook Page + Instagram professional account | 1 item on selected days |
| Religious | Different private Telegram channel | Its Facebook Page + Instagram professional account | 4 or 5 items on selected days |

The channels, remote accounts and publishing schedules must be isolated. Owner may send text, images, videos, albums and captions. No per-item approval is required after the system has been configured and validated.

## Product flow

1. Index private Telegram messages, including older history, and recover after interrupted syncs.
2. Group multi-message Telegram albums into one canonical content item.
3. Store minimal message metadata and a durable source checkpoint; do not bulk-copy archived media.
4. Evaluate configurable local-day schedules independently for each route.
5. Atomically reserve one eligible item and one scheduled slot; create a separate delivery intent for every destination.
6. Fetch compatible media when needed, then call a platform-specific adapter.
7. Persist remote identifiers and status. If the remote outcome is unknown, stop automated retries and reconcile before retrying.
8. Physically delete temporary media after confirmed safe retention; originals remain in Telegram.

For text-only content, Facebook is eligible and Instagram is skipped with an explicit reason. Mixed albums need explicit destination validation, not silent image/video loss. Captions are preserved by default: no automatic AI rewriting, especially of religious material.

## Architecture boundary

Our own TypeScript domain core, a NestJS API, a PostgreSQL-backed transactional queue/outbox worker, provider adapters and a Next.js management UI are planned. Do not introduce Redis or Temporal simply because Postiz uses them; the queue correctness must be proven first, with fewer deployable services.

**Postiz is not a dependency.** Read-only study and comparison are allowed. Any future decision to reuse an upstream code fragment requires a separate license-compliance review; do not paste code or copy upstream files by default.

## What is actually built now

Phase 01 creates only repository architecture documentation, a minimal TypeScript package of domain rules and unit tests. Telegram, Meta, storage, authentication, database and deployment are not yet implemented.

**Approval gate:** each phase is reviewed and tested before starting the next one.
