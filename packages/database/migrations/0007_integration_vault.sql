-- Installation-level secret store: exact allowlist only, never client-visible.
CREATE TABLE integration_vault (
  name text PRIMARY KEY CHECK (
    name IN ('META_APP_ID','META_APP_SECRET','STORAGE_ACCESS_KEY_ID',
             'STORAGE_SECRET_ACCESS_KEY','STORAGE_BUCKET',
             'STORAGE_REGION','STORAGE_ENDPOINT','STORAGE_PUBLIC_HOST')
  ),
  encrypted_value bytea NOT NULL CHECK(octet_length(encrypted_value)>0),
  iv bytea NOT NULL CHECK(octet_length(iv)=12),
  tag bytea NOT NULL CHECK(octet_length(tag)=16),
  version smallint NOT NULL DEFAULT 1 CHECK(version=1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
