-- Exactly one publishing route is assigned to one private Telegram source.
ALTER TABLE routes ADD CONSTRAINT unique_route_source UNIQUE(source_id);
