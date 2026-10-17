# Publishing job dispatch, no accounts configured

The original publication engine now has an explicit `allowLive` gate (off by default in any intended entrypoint). Database selection claims only jobs where the route, source and destination are enabled, the destination has encrypted credentials, and publication state is PENDING.

It marks a publication SUBMITTING **before** invoking its provider adapter. A success or failure/uncertain outcome is written to publication and job inside one fenced PostgreSQL transaction. Unknown timeouts or missing remote IDs become UNCERTAIN and cannot be automatically resent. An expired claim is quarantined by the existing reconciler.

The `OutboundPublisher` port is intentionally injected; account/session secrets and media URLs will only be supplied after explicit setup. Meta adapters exist, but end-to-end integration of their staged URLs, refreshed tokens, Instagram container IDs, video/album uploads and ambiguity reconciliation is unfinished. **Do not enable live publishing.**

The publisher worker must be protected by additional deployment and integration gates. No actual remote posts have been made.
