# On-demand streaming and temporary media

Current code includes chunk-limited streaming, supported MIME budgets, temporary-media database entries and conservative physical cleanup: a file is only removed when its TTL has expired and no relevant publication is unfinished or uncertain.

A source connector must fetch media **only for a claimed item**, with format/size validation before transfer. The object storage adapter (R2/S3 or compatible), signed public staging URLs, Telegram stream and provider-specific video transcoding are deferred until service configuration. Tests only use byte streams and test storage adapters; no real Telegram media has been downloaded.

The current cleanup holds a PostgreSQL row lock while calling an object-storage adapter. The adapter must have a bounded timeout. Before scale/production, introduce a dedicated cleanup lease/fence and recover stale cleanup leases to avoid long DB locks. Do not mark this as production-proven yet.
