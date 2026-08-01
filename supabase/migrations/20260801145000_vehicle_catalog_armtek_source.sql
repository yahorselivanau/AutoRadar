alter table public.vehicle_catalog_models
  alter column year_from drop not null;

alter table public.vehicle_catalog_models
  drop constraint if exists vehicle_catalog_models_year_to_check;

alter table public.vehicle_catalog_models
  add constraint vehicle_catalog_models_year_to_check
  check (year_from is null or year_to is null or year_to >= year_from);

create index if not exists vehicle_catalog_models_source_make_name_idx
  on public.vehicle_catalog_models(source, make_id, name_normalized);
