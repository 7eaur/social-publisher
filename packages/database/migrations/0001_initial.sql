-- Social Publisher original schema. PostgreSQL >= 15.
-- This file is immutable after release; follow-ups use new versioned migrations.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','OPERATOR','VIEWER')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(email) AND length(email) <= 254)
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  csrf_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_valid ON auth_sessions(user_id, expires_at);

CREATE TABLE content_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind = 'TELEGRAM'),
  external_peer_id text NOT NULL UNIQUE,
  label text NOT NULL,
  last_indexed_message_id bigint,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(label)) > 0),
  CHECK (last_indexed_message_id IS NULL OR last_indexed_message_id > 0)
);

CREATE TABLE destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('FACEBOOK','INSTAGRAM')),
  external_account_id text NOT NULL,
  display_name text NOT NULL,
  credentials_ciphertext bytea,
  credentials_iv bytea,
  credentials_tag bytea,
  credentials_version integer,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_account_id),
  CHECK (
    (credentials_ciphertext IS NULL AND credentials_iv IS NULL AND credentials_tag IS NULL AND credentials_version IS NULL)
    OR (credentials_ciphertext IS NOT NULL AND credentials_iv IS NOT NULL AND credentials_tag IS NOT NULL AND credentials_version IS NOT NULL)
  )
);

CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9_-]{0,63}$'),
  source_id uuid NOT NULL REFERENCES content_sources(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX routes_source_idx ON routes(source_id);

CREATE TABLE route_destinations (
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  PRIMARY KEY (route_id, destination_id),
  UNIQUE (destination_id)
);

CREATE TABLE source_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL REFERENCES content_sources(id) ON DELETE RESTRICT,
  canonical_message_id bigint NOT NULL CHECK (canonical_message_id > 0),
  telegram_group_id text,
  kind text NOT NULL CHECK (kind IN ('TEXT','IMAGE','VIDEO','IMAGE_ALBUM','VIDEO_ALBUM','MIXED_ALBUM')),
  caption text,
  media_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(media_metadata) = 'object'),
  source_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, canonical_message_id),
  UNIQUE (id, route_id)
);
CREATE INDEX source_items_route_order_idx ON source_items(route_id, source_created_at, canonical_message_id);

CREATE TABLE schedule_rules (
  route_id uuid PRIMARY KEY REFERENCES routes(id) ON DELETE CASCADE,
  time_zone text NOT NULL,
  iso_weekdays smallint[] NOT NULL,
  slots text[] NOT NULL,
  daily_limit integer NOT NULL CHECK (daily_limit BETWEEN 1 AND 50),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (array_length(iso_weekdays, 1) BETWEEN 1 AND 7),
  CHECK (array_length(slots, 1) BETWEEN 1 AND 50)
);

CREATE TABLE schedule_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
  source_item_id uuid NOT NULL,
  local_date date NOT NULL,
  slot text NOT NULL CHECK (slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_item_id, route_id) REFERENCES source_items(id, route_id),
  UNIQUE(route_id, local_date, slot),
  UNIQUE(route_id, source_item_id)
);
CREATE INDEX schedule_claims_daily_idx ON schedule_claims(route_id, local_date);

CREATE TABLE publication_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id uuid NOT NULL REFERENCES source_items(id) ON DELETE RESTRICT,
  destination_id uuid NOT NULL REFERENCES destinations(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','RESERVED','SUBMITTING','CONFIRMED','SKIPPED_UNSUPPORTED','RETRYABLE_FAILURE','PERMANENT_FAILURE','UNCERTAIN')),
  remote_id text,
  remote_url text,
  last_error_code text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_item_id, destination_id)
);

CREATE TABLE outbox_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('PUBLISH','SYNC','SCHEDULE','CLEANUP')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','CLAIMED','COMPLETED','UNCERTAIN')),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  leased_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state='CLAIMED' AND lease_token IS NOT NULL AND leased_until IS NOT NULL)
    OR (state<>'CLAIMED' AND lease_token IS NULL AND leased_until IS NULL)
  )
);
CREATE INDEX outbox_pending_idx ON outbox_jobs(available_at,created_at,id) WHERE state='PENDING';
CREATE INDEX outbox_expired_idx ON outbox_jobs(leased_until) WHERE state='CLAIMED';

CREATE TABLE temporary_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id uuid NOT NULL REFERENCES source_items(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'STAGED' CHECK (state IN ('STAGED','LEASED','EXPIRED','DELETED')),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_time_idx ON audit_events(created_at DESC);
