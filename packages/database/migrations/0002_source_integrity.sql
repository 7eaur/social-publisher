-- A source item may never claim a route belonging to another source.
ALTER TABLE routes ADD CONSTRAINT routes_id_source_unique UNIQUE(id,source_id);
ALTER TABLE source_items
  ADD CONSTRAINT source_item_route_source_fk
  FOREIGN KEY (route_id,source_id) REFERENCES routes(id,source_id);

-- Persistent login throttle is independent of a single API process.
CREATE TABLE login_rate_limits (
  key_hash char(64) PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);
CREATE INDEX login_rate_limits_blocked ON login_rate_limits(blocked_until)
  WHERE blocked_until IS NOT NULL;
