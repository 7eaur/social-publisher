# Social Publisher — Requirements

**Status:** Approved scope + explicitly open details. No production work initiated.  
**Date:** 2026-10-12  
**Required Postiz reference:** 91c91f633a0175fb3914dba64c932928c514b72a (source import pending).

## 1. Scope and priorities

**P0:** two Telegram sources; resilient indexing; mixed media; per-route schedules; safe Facebook/Instagram delivery; deduplication per destination; media lifetime; restart recovery; permissions and secrets.

**P1:** Telegram error notifications, source/queue status, manual pause/resume and better monitoring.

**P2:** TikTok, empirical time-of-day optimization, optional caption enhancement.

## 2. Functional requirements

| ID | Priority | Requirement | Acceptance |
|---|---|---|---|
| FR-01 | P0 | Two independently configured private Telegram channels | Messages cannot cross between routes |
| FR-02 | P0 | Telegram remains original content and media archive | No bulk media import; originals remain in channel |
| FR-03 | P0 | Incremental and historical indexing | Resuming after outage catches unindexed messages |
| FR-04 | P0 | Text, image, video and albums | Detect and validate content, with platform-specific handling |
| FR-05 | P0 | No approval required per post | Eligible item goes to publisher automatically |
| FR-06 | P0 | Wasl rule: one post per selected publishing day | Never exceed day's configured limit |
| FR-07 | P0 | Religious rule: four or five posts on selected days | Posts distributed among independently configured slots |
| FR-08 | P0 | Times, weekdays and timezone managed from UI | Persist and apply without rebuilding code |
| FR-09 | P0 | Postiz's original Facebook/Instagram connectors publish | Persist remote ID/link and accurate per-platform state |
| FR-10 | P0 | Source/destination deduplication | One publication record per item + target, atomic claim |
| FR-11 | P0 | Partial failure handling | Successful destination is never blindly republished |
| FR-12 | P0 | Ambiguous remote outcome handling | Stop or reconcile before any retry |
| FR-13 | P0 | On-demand media retrieval and safe cleanup | No unbounded storage growth or premature deletion |
| FR-14 | P0 | Upstream functionality regression protection | Existing relevant Postiz tests pass |
| FR-15 | P1 | Queue and source monitoring | Show pending, published, failed, skipped counts |
| FR-16 | P1 | Pause/resume a route | Other route keeps publishing |
| FR-17 | P1 | Telegram alerts | Inform owner about broken sessions, expired permissions and persistent failures |
| FR-18 | P2 | TikTok extension | Add destination without redesigning sources |
| FR-19 | P2 | Analytics-informed timing | Use measured engagement, never pretend fixed slots are universally optimal |

## 3. Important platform rules

- Instagram professional account requires a visual asset for feed publishing; Facebook can accept text-only content. For a text-only source item mark Instagram **SKIPPED_UNSUPPORTED**, not failed and not generated with AI by default.
- Mixed media and albums require provider-specific validation and explicit transformation policy.
- Facebook Page and Instagram account links do not replace OAuth token, permission, and app review requirements.
- No blind retries on network timeouts after an external publish request; preserve ambiguous status for reconciliation.

## 4. Proposed data model

- **ContentSource:** organization, Telegram channel peer ID, route, last indexed message, connection health.
- **SourceItem:** channel ID, message ID, album/group ID, type, metadata, text/caption, source timestamp, status.
- **ScheduleRule:** route, timezone, permitted weekdays, time slots, daily limit, enabled.
- **PublicationRecord:** item, Postiz integration, state, Postiz post ID, remote ID/URL, attempts, last error.
- **TemporaryMedia:** storage key, source item, retention/lease and cleanup state.

Candidate unique indexes: (sourceId, telegramMessageId), (sourceItemId, integrationId). Grouped Telegram media may require an additional canonical group-level ID to avoid treating album parts as independent posts.

The application must use atomic claims, resilient checkpoints and idempotent state transitions. **Absolute external exactly-once delivery is not universally guaranteed by social media APIs**; the required safeguard is no automatic reissue when success is uncertain.

## 5. Operational/security requirements

- Railway or another chosen service must store sensitive Telegram session and Meta tokens as deployment secrets.
- Limit stored media and execution logs; use a safe expiry/cleanup mechanism and recovery job.
- Retain backup strategy, observability, health checks and rollback.
- Respect external rate limits; retry only when safe.
- Keep the custom modules localized and compatible with upstream upgrades.
- Comply with Postiz AGPL-3.0 terms.
- Do not delete or rewrite original Telegram messages.

## 6. Items still requiring a product decision

1. Oldest-first FIFO with or without an optional priority override.
2. Caption unchanged or strictly controlled clean-up (no modification of religious quotations without permission).
3. Specific weekdays, time slots and final timezone for the two routes.
4. Fewer items than the daily quota: suggested action is to post available items only.
5. Handling edits/deletes in Telegram and unsupported albums.
6. Temporary storage provider, maximum media file size and safe retention interval.

## 7. Stage 1 boundaries

Only private GitHub foundation, verified Postiz import, baseline reference, development branch and documentation. Do not deploy, connect live accounts, access secrets, alter original source behavior or start the next phase.
