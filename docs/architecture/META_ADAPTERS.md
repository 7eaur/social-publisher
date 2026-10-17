# Meta adapters — implementation without live credentials

This original integration separates Graph HTTP transport, Facebook Page feed/photo publishing and Instagram media container preparation/polling/final publishing. Token values are sent in Authorization Bearer headers, never query strings. The media URL must use an explicit approved HTTPS staging hostname, provided later in platform configuration.

All integration tests mock fetch; no Facebook Page or Instagram professional account has been connected. The system must not activate publishing until:
1. Valid Meta app and permissions verified for the specific Page/account, with applicable review.
2. Encrypted credential and account IDs configured through authenticated admin flow.
3. Media preparation pipeline supports the actual media type and hosting conditions.
4. Dispatcher persists Instagram container IDs before final submission, and marks ambiguous remote outcomes UNCERTAIN instead of blind retries.
5. Real test-account publishing, reconciliation, deletion/retention and permission expiry validated.

Supported by current adapters: Facebook TEXT or single IMAGE; Instagram IMAGE and REELS container operations with processing status; album publication and Facebook VIDEO upload are not yet included. Do not silently downgrade or discard media. Graph API version is injected; version compatibility must be reverified before activating live posting.
