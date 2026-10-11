# Social Publisher — Project Overview

**Status:** Planning baseline only; source import not completed.  
**Updated:** 2026-10-12  
**Private repository:** https://github.com/7eaur/social-publisher  
**Upstream:** https://github.com/gitroomhq/postiz-app  
**Pinned source reference (target, NOT imported):** 91c91f633a0175fb3914dba64c932928c514b72a  
**Original license:** AGPL-3.0

## 1. Purpose

Social Publisher is a customized, self-hosted Postiz installation, with a **single application and management interface**. Telegram private channels remain the canonical content archive; the system indexes their messages, schedules eligible items, and publishes on Facebook Pages and connected Instagram professional accounts.

This is NOT a second automation platform: **no n8n**. Reuse Postiz's existing editor, calendar, channel integrations, analytics, post publishing, recovery and Temporal-based orchestration. Build only missing Telegram-source ingestion, independent publishing rules, source-based deduplication, and short-lived media handling.

## 2. Content routes

| Route | Private content source | Publishing targets | Proposed policy |
|---|---|---|---|
| Wasl Tech | Dedicated Telegram private channel | Wasl Facebook Page + Instagram account | 1 post on each configured publishing day |
| Religious | Dedicated Telegram private channel | Religious Facebook Page + linked Instagram | 4–5 posts per configured publishing day at adjustable interaction-oriented times |

TikTok is a future extension; the Postiz TikTok connector remains intact without activation in initial scope.

## 3. User experience

1. Owner sends mixed content (text, images, videos, albums and captions) into the appropriate private Telegram channel, including large batches.
2. The system records identifiers, metadata, and sync checkpoints. It does **not** bulk-download the source media.
3. Schedule rules independently select eligible Telegram items for each route.
4. At publishing time the chosen item's media is downloaded/streamed on demand to temporary storage and validated for each platform.
5. Postiz's original Facebook/Instagram integrations publish without per-item manual approval.
6. The system records each destination's result separately; publishing to one must not cause duplicates on the other.
7. Media objects are cleaned up only after delivery is resolved and the safety retention window has ended. Telegram source messages remain unchanged.

Text-only messages may be published on Facebook. Instagram requires compatible visual content; unsupported items are explicitly skipped for that destination without blocking another target.

## 4. Architecture principles

- Keep one codebase and the required Postiz services, including PostgreSQL, Redis, Temporal and workers.
- Preserve original Postiz source behavior and keep the custom modules isolated where possible.
- Retain source records in Telegram. Store only minimal database metadata for queueing, scheduling and publication verification.
- Protect against duplicate deliveries via unique source-message/destination keys, transactional claiming, and non-blind retry.
- If an external publishing operation has an unknown result, reconcile before attempting another publish.
- Do not retain Telegram user sessions, Meta tokens, or other secrets in Git or application logs.
- Self-hosted Meta publishing requires correct permissions and developer app setup; Facebook–Instagram linkage alone is insufficient.
- Follow AGPL-3.0 license obligations.

## 5. Additions only

- **TelegramSources:** private channel connection, historical and incremental indexing, checkpoint recovery.
- **ContentQueue:** per-route backlog, source mapping, ordered item selection and duplicate protection.
- **PublishingRules:** weekly days, daily limits, time slots, timezone, per-route pause/resume.
- **MediaLifecycle:** on-demand media retrieval, safe temporary exposure to publishing APIs, cleanup and orphan handling.
- **Management UI additions:** small source/queue/schedule views within Postiz, plus actionable publishing failure alerts.

The existing Postiz Telegram provider is for publishing **to** Telegram and is not our Telegram source-reader. Preserve it.

## 6. Out of scope initially

- No n8n; no full replacement of Postiz's publishing engine or UI.
- No automatic AI rewriting, especially for religious quotations, until explicitly approved.
- No TikTok activation in the first stage.
- No rehosting the full Telegram video archive.
- No claim of optimal engagement times before actual analytics.
- No production deployment during the GitHub foundation stage.

## 7. Open functional decisions

Exact publishing days/times, FIFO vs priority override, caption cleaning policy, mixed-media album transformations, Telegram edits/deletions, storage size/TTL limits, and treatment of uncertain external publishing results remain for specification and tests.

## 8. Repository status

On 2026-10-12 the connected account was verified as **7eaur** and the target repository as **Private**. It is an independent repository, not a true GitHub fork. The branch holding this documentation is a **temporary bootstrap** until the original Postiz Git tree and history are imported, the main branch is pinned to the source SHA above, and the documentation branch is rebased onto it. **Do not mistake the documentation bootstrap for imported Postiz source code.**
