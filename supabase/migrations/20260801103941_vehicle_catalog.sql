create table public.vehicle_catalog_makes (
  id bigint generated always as identity primary key,
  source text not null default 'zap.by',
  source_id integer,
  name text not null,
  name_ru text,
  name_normalized text not null,
  name_ru_normalized text,
  catalog_version text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source, name_normalized)
);

create index vehicle_catalog_makes_name_normalized_idx
  on public.vehicle_catalog_makes(name_normalized);

create table public.vehicle_catalog_models (
  id bigint generated always as identity primary key,
  make_id bigint not null references public.vehicle_catalog_makes(id) on delete cascade,
  source text not null default 'zap.by',
  catalog_key text not null unique,
  name text not null,
  name_normalized text not null,
  generation text,
  body_type text,
  year_from integer not null check (year_from between 1886 and 2200),
  year_to integer check (year_to is null or year_to between 1886 and 2200),
  catalog_version text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (year_to is null or year_to >= year_from)
);

create index vehicle_catalog_models_make_name_idx
  on public.vehicle_catalog_models(make_id, name_normalized);
create index vehicle_catalog_models_year_idx
  on public.vehicle_catalog_models(make_id, year_from, year_to);

alter table public.vehicle_catalog_makes enable row level security;
alter table public.vehicle_catalog_models enable row level security;

revoke all on table public.vehicle_catalog_makes from anon, authenticated;
revoke all on table public.vehicle_catalog_models from anon, authenticated;
grant select, insert, update, delete on table public.vehicle_catalog_makes to service_role;
grant select, insert, update, delete on table public.vehicle_catalog_models to service_role;
grant usage, select on sequence public.vehicle_catalog_makes_id_seq to service_role;
grant usage, select on sequence public.vehicle_catalog_models_id_seq to service_role;

comment on table public.vehicle_catalog_makes is
  'Server-only reference catalog imported from the source vehicle catalog.';
comment on table public.vehicle_catalog_models is
  'Server-only vehicle model variants used to normalize search requests.';
