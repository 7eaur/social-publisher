# Social Publisher — Implementation Plan

**Status:** Stage 1 partially implemented; source/history import still pending.  
**Date:** 2026-10-12  
**Repository:** 7eaur/social-publisher (verified Private, independent repository)  
**Upstream:** https://github.com/gitroomhq/postiz-app  
**Pinned source SHA target:** 91c91f633a0175fb3914dba64c932928c514b72a  
**Development branch:** feature/telegram-publisher-foundation

## 0. Critical baseline note

This repository is **not a private GitHub fork**: GitHub forks of public repositories cannot be made private. It is an independent private repository intended to contain an imported copy of Postiz with Git history. The available GitHub connector can write files and branches to existing repositories, but it cannot import an entire upstream Git repository and its full history.

A bootstrap commit was created to allow documentation-only work. **The current main branch is not the pinned Postiz source**; the development branch is temporary and must be recreated or rebased after the source import.

**Verified import attempt (2026-10-12):** A one-time GitHub Actions job successfully fetched upstream Postiz and checked out the pinned commit, but GitHub rejected the push of the original tree: the Actions token lacked permission to create/update upstream workflow files (such as .github/workflows/build-containers.yml). The attempted workflow was removed from main after failure. No source code was imported and no deployment occurred. The approved remedy is an authenticated Git import performed with credentials allowed to write workflow files, not bypassing that GitHub permission. No claim of a source import, runnable Postiz code, or completed Stage 1 may be made until all baseline checks pass.

## 1. Stage 1 — Foundation

1. [x] Confirm authenticated GitHub owner is 7eaur and repository is Private.
2. [x] Choose upstream pinned commit and record its origin.
3. [x] Create documentation-only temporary branch.
4. [x] Upload PROJECT_OVERVIEW.md, REQUIREMENTS.md and IMPLEMENTATION_PLAN.md to that branch.
5. [ ] Import upstream Postiz code **and Git history** into this private repository.
6. [ ] Reset or establish main at the pinned Postiz commit, retaining AGPL license and complete source tree.
7. [ ] Re-create/rebase development branch from the pinned source main and retain only three documentation changes.
8. [ ] Verify main source SHA, branch ancestry, documentation contents and git diff with GitHub.
9. [x] Do not deploy, connect accounts, or modify Postiz functions in this stage.

### Required import process (NOT executed)

With an authorized Git client and credentials for private repository. **Temporarily disable GitHub Actions in Settings → Actions → General before importing**: the untouched Postiz baseline contains upstream workflows that might otherwise be triggered on a user-authenticated push. Re-enable only after CI review in the next phase.

~~~bash
git clone https://github.com/gitroomhq/postiz-app.git social-publisher-import
cd social-publisher-import
git switch -C main 91c91f633a0175fb3914dba64c932928c514b72a
git remote rename origin upstream
git remote add origin git@github.com:7eaur/social-publisher.git
# Repository currently contains a temporary bootstrap: preserve the 3 docs
# and verify desired ref state before deliberately replacing the bootstrap.
git push --force-with-lease origin main
git switch -c feature/telegram-publisher-foundation
# Add the reviewed 3 documentation files from the temporary branch/backup,
# then commit documentation only:
git add PROJECT_OVERVIEW.md REQUIREMENTS.md IMPLEMENTATION_PLAN.md
git commit -m "docs: establish social publisher scope and implementation plan"
git push --force-with-lease -u origin feature/telegram-publisher-foundation
~~~

Never run the overwrite blindly if unexpected commits appear; inspect remote branches and backups first. **No force push has been performed by the assistant.**

### Stage 1 acceptance

- Private repo confirmed.
- main points to pinned source commit and includes actual Postiz tree/history/license.
- Development branch descends from that commit.
- Only new documents differ from original Postiz at baseline.
- No Railway deployment, production token, or functional changes.

## 2. Stage 2 — Untouched Postiz smoke test

- Validate Node/pnpm prerequisites, PostgreSQL, Redis, Temporal, workers and frontend/backend.
- Start the original application; verify authentication, calendar, media workflow, scheduling and API.
- Test connection and actual authorized publishing to selected Facebook/Instagram accounts, subject to Meta app permissions and reviews.
- Measure CPU/RAM/storage costs before choosing Railway production shape.
- **Gate:** verified publishing and documented resource envelope; no unreviewed feature changes.

## 3. Stage 3 — Telegram sources

- Keep Postiz's original Telegram publishing provider unchanged.
- Build source connector using supported Telegram client functionality for channel history retrieval.
- Index IDs and metadata without bulk media downloads; handle albums, edits/deletes and pagination.
- Persist a secure session and atomic resume checkpoint.
- **Gate:** both source channels recover correctly after interruption.

## 4. Stage 4 — Routes and schedule

- Implement independent per-route ContentQueue + PublishingRules.
- Choose unique source/target keys, atomic queue claiming and per-destination publication records.
- Configure daily caps, weekdays, times, timezone and pause/resume.
- Reuse Postiz PostsService / Temporal without creating a parallel publishing engine.
- **Gate:** repeat scans, overlaps, slot transitions and failures do not create duplicate posts.

## 5. Stage 5 — Temporary media lifecycle

- Retrieve media just in time with streaming where supported.
- Validate format/size by platform; create temporary accessible media URL when required.
- Reconcile platform processing, then physically remove temporary media after safe retention window; clean orphaned media.
- **Gate:** successful/failed operations do not grow storage without bound.

## 6. Stage 6 — Minimal management UI and alerts

- Add source health, queue, schedule, delivery status, temporary media stats and error notifications inside existing Postiz.
- Keep original editor, analytics and platform connectors.
- **Gate:** all routes can be monitored and paused independently.

## 7. Stage 7 — Regression, security and deployment

- Unit/integration/E2E, replays, restart/partial failure, token expiry, media limits, Meta idempotency and retention tests.
- Check upstream integration, license compliance, secret hygiene, backups and rollback.
- Only after passing gates: staged Railway testing and then deliberate production activation.

## Branch policy

- main must be the untouched source baseline after import.
- feature/telegram-publisher-foundation contains planning documentation only initially.
- Follow-on features developed in isolated branches or commits following code review.
- Stage transitions require an explicit completion report and user acceptance.

**STOP:** Do not start Stage 2 until source import and ancestry verification are complete.
