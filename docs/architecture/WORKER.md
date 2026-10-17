# Worker without account sessions

The worker loop runs one tick at a time and can be stopped cleanly. It polls the PostgreSQL scheduler and quarantines expired job leases. It does not make Telegram or Meta API calls.

Starting the worker with LIVE_PUBLISHING_ENABLED=true deliberately fails, because verified account linking, media staging, remote status reconciliation and real-account acceptance tests have not been completed.

No worker has been deployed on Railway. The polling loop only runs if an operator explicitly starts the compiled project.
