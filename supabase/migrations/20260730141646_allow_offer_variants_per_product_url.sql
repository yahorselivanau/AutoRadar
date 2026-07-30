-- A product card may expose several supplier/warehouse variants. Their
-- external IDs are unique, while the user-facing product URL is shared.
alter table public.offers
  drop constraint if exists offers_search_job_id_external_url_key;
