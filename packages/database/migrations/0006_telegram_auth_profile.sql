-- Telegram API ID + API hash, encrypted at rest. Session itself is stored in
-- telegram_session_credentials, also encrypted and scoped to source_id.
CREATE TABLE telegram_api_credentials (
  source_id uuid PRIMARY KEY REFERENCES content_sources(id) ON DELETE CASCADE,
  api_id integer NOT NULL CHECK (api_id > 0),
  encrypted_hash bytea NOT NULL CHECK (octet_length(encrypted_hash) > 0),
  iv bytea NOT NULL CHECK (octet_length(iv)=12),
  tag bytea NOT NULL CHECK (octet_length(tag)=16),
  version smallint NOT NULL DEFAULT 1 CHECK (version=1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
