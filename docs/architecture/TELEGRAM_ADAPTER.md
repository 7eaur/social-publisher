# Telegram source design (account connection deferred)

- Do not require or generate Telegram user sessions during development.
- The source port `TelegramHistoryPort` is consumed using an in-memory test adapter.
- Production adapter will authenticate an authorized user session, resolve exactly the approved private channel peer and adapt GramJS iterMessages(reverse=true,minId=checkpoint,limit=100). Channel entity/access-hash resolution must be verified before use; never scan all accessible channels.
- Do not download whole media archives. Store Telegram IDs, captions and album groups; media bytes only when a publishing action needs them.
- Database checkpoint is updated only after the entire bounded page is committed.
- Albums may span pages: a persistent group key and child message-part rows reconstruct one canonical item.
- Editing/deletion synchronization and partial group completion need a separately tested policy before live publishing.
- A temporary account-less mock adapter is for tests only. No external Telegram traffic occurs in this phase.
