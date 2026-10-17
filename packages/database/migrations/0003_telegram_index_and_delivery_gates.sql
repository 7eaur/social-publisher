-- Telegram message parts permit albums spanning multiple sync batches.
ALTER TABLE source_items ADD CONSTRAINT source_group_canonical_unique UNIQUE(source_id, telegram_group_id);
CREATE TABLE source_message_parts (
 source_id uuid NOT NULL REFERENCES content_sources(id) ON DELETE RESTRICT,
 telegram_message_id bigint NOT NULL CHECK (telegram_message_id>0),
 source_item_id uuid NOT NULL REFERENCES source_items(id) ON DELETE RESTRICT,
 content_kind text NOT NULL CHECK(content_kind IN ('TEXT','IMAGE','VIDEO')),
 caption text,
 sent_at timestamptz NOT NULL,
 PRIMARY KEY(source_id,telegram_message_id)
);
CREATE INDEX source_message_parts_item ON source_message_parts(source_item_id,telegram_message_id);

-- Remote publication is OFF until account connection and full permission checks.
ALTER TABLE publication_records ADD COLUMN dispatched_at timestamptz;
ALTER TABLE publication_records ADD COLUMN confirmed_at timestamptz;

-- Installation-bound session encryption is added only when Telegram is explicitly configured.
CREATE TABLE telegram_session_credentials (
 source_id uuid PRIMARY KEY REFERENCES content_sources(id) ON DELETE CASCADE,
 encrypted_session bytea NOT NULL,
 iv bytea NOT NULL,
 tag bytea NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK (version=1),
 updated_at timestamptz NOT NULL DEFAULT now()
);
