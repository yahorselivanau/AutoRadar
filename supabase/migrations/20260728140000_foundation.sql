create extension if not exists pgcrypto;

create type public.search_job_status as enum (
  'created',
  'running',
  'partial',
  'completed',
  'failed',
  'cancelled',
  'expired'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  vin_encrypted text,
  make text not null,
  model text not null,
  year integer not null check (year between 1886 and 2200),
  generation text,
  body text,
  engine text,
  transmission text,
  notes text,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index vehicles_user_id_idx on public.vehicles(user_id);

create table public.search_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id_hash text,
  status public.search_job_status not null default 'created',
  query_text text not null,
  request_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index search_jobs_user_created_idx
  on public.search_jobs(user_id, created_at desc);
create index search_jobs_session_created_idx
  on public.search_jobs(session_id_hash, created_at desc);

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.search_jobs enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "vehicles_manage_own"
  on public.vehicles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "search_jobs_select_own"
  on public.search_jobs for select
  using (auth.uid() = user_id);
