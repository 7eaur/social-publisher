# Scheduler policy without live accounts

Each route is disabled until configured and explicitly enabled. The scheduler also requires ALL assigned destinations to be enabled and have encrypted credentials; otherwise it does not reserve a slot or generate a publication job.

One PostgreSQL transaction and per-route FOR UPDATE lock handle: quota check, exact local-time due check, oldest eligible item, schedule claim, and destination publication intents. The remote call is strictly outside the transaction.

Telegram media posts have a 10-minute indexing settling window based on the latest persisted message part before becoming schedulable. This protects against splitting albums between history pages. Recheck incomplete album cases with real channel traffic before enabling publishing.

Schedules are IANA timezone-aware and use unique local date/HH:mm keys to prevent double claims in repeated DST hours. Missed-slot catch-up and changing schedule rules after slots are reserved need acceptance tests later; this evaluator deliberately does not invent missed publishing opportunities.

No configured source and destination implies zero jobs. Do not insert dummy credentials in any non-test environment.
