-- Scheduling cannot consume an album while new parts might still be arriving.
ALTER TABLE source_message_parts ADD COLUMN indexed_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX source_parts_fresh ON source_message_parts(source_item_id,indexed_at DESC);
