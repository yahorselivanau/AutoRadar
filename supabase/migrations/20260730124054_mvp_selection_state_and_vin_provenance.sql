alter table public.conversation_states
  add column if not exists schema_version integer not null default 2
    check (schema_version = 2),
  add column if not exists vehicle_draft jsonb,
  add column if not exists readiness text not null default 'collecting'
    check (
      readiness in (
        'collecting',
        'needs_vehicle_confirmation',
        'needs_part_confirmation',
        'ready',
        'searching'
      )
    ),
  add column if not exists pending_clarification jsonb,
  add column if not exists symptom_assessment jsonb;

alter table public.vehicles
  add column if not exists vin_resolution_source text
    check (vin_resolution_source in ('nhtsa-vpic', 'manual')),
  add column if not exists vin_resolution_provenance jsonb;

comment on column public.vehicles.vin_resolution_provenance is
  'Safe VIN resolution metadata only. Must never contain the raw VIN.';

alter table public.search_jobs
  add column if not exists clarification jsonb;
