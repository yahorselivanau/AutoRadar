update public.vehicles
set vin_resolution_source = 'manual'
where vin_resolution_source = 'nhtsa-vpic';

alter table public.vehicles
  drop constraint if exists vehicles_vin_resolution_source_check;

alter table public.vehicles
  add constraint vehicles_vin_resolution_source_check
  check (vin_resolution_source in ('auto1', 'zap', 'armtek', 'manual'));
