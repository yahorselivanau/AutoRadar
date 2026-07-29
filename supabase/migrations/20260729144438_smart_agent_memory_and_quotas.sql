alter table public.vehicles
  add column if not exists doors integer check (doors between 2 and 6);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id_hash text,
  title text not null default 'Новый поиск',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint conversations_owner_check check (
    (user_id is not null and session_id_hash is null)
    or (user_id is null and session_id_hash is not null)
  )
);

create index conversations_user_updated_idx
  on public.conversations(user_id, updated_at desc);
create index conversations_session_updated_idx
  on public.conversations(session_id_hash, updated_at desc);

create table public.messages (
  id text primary key,
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  position integer not null check (position >= 0),
  role text not null check (role in ('system', 'user', 'assistant')),
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  model text,
  prompt_version text,
  usage jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique(conversation_id, position)
);

create index messages_conversation_created_idx
  on public.messages(conversation_id, created_at);

create table public.conversation_states (
  conversation_id uuid primary key
    references public.conversations(id) on delete cascade,
  active_vehicle jsonb,
  search_draft jsonb,
  latest_search_job_id uuid,
  latest_search_summary jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.search_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  session_id_hash text,
  query_text text not null,
  request_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint search_requests_owner_check check (
    (user_id is not null and session_id_hash is null)
    or (user_id is null and session_id_hash is not null)
  )
);

create index search_requests_conversation_created_idx
  on public.search_requests(conversation_id, created_at desc);
create index search_requests_user_created_idx
  on public.search_requests(user_id, created_at desc);
create index search_requests_session_created_idx
  on public.search_requests(session_id_hash, created_at desc);

alter table public.search_jobs
  add column if not exists conversation_id uuid
    references public.conversations(id) on delete set null,
  add column if not exists search_request_id uuid
    references public.search_requests(id) on delete set null,
  add column if not exists idempotency_key text;

create unique index search_jobs_owner_idempotency_idx
  on public.search_jobs(
    coalesce(user_id::text, session_id_hash),
    idempotency_key
  )
  where idempotency_key is not null;
create index search_jobs_conversation_created_idx
  on public.search_jobs(conversation_id, created_at desc);

create table public.search_job_sources (
  id uuid primary key default gen_random_uuid(),
  search_job_id uuid not null
    references public.search_jobs(id) on delete cascade,
  source_id text not null,
  status text not null check (
    status in (
      'queued',
      'running',
      'completed',
      'empty',
      'timeout',
      'blocked',
      'failed',
      'disabled'
    )
  ),
  offer_count integer not null default 0 check (offer_count >= 0),
  duration_ms integer check (duration_ms >= 0),
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(search_job_id, source_id)
);

create index search_job_sources_job_idx
  on public.search_job_sources(search_job_id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  search_job_id uuid not null
    references public.search_jobs(id) on delete cascade,
  source_id text not null,
  external_id text not null,
  external_url text not null,
  normalized_part_number text,
  seller_name text,
  price_amount numeric(14, 2),
  currency text not null default 'BYN' check (currency = 'BYN'),
  payload jsonb not null,
  fetched_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique(search_job_id, source_id, external_id),
  unique(search_job_id, external_url)
);

create index offers_search_job_idx on public.offers(search_job_id);
create index offers_source_external_idx
  on public.offers(source_id, external_id);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id_hash text,
  event_type text not null check (
    event_type in ('conversation_created', 'assistant_turn', 'search_started')
  ),
  conversation_id uuid references public.conversations(id) on delete set null,
  search_job_id uuid references public.search_jobs(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint usage_events_owner_check check (
    (user_id is not null and session_id_hash is null)
    or (user_id is null and session_id_hash is not null)
  )
);

create index usage_events_session_type_created_idx
  on public.usage_events(session_id_hash, event_type, created_at desc);
create index usage_events_user_type_created_idx
  on public.usage_events(user_id, event_type, created_at desc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_states enable row level security;
alter table public.search_requests enable row level security;
alter table public.search_job_sources enable row level security;
alter table public.offers enable row level security;
alter table public.usage_events enable row level security;

create policy "conversations_select_own"
  on public.conversations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "conversations_insert_own"
  on public.conversations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "conversations_update_own"
  on public.conversations for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "conversations_delete_own"
  on public.conversations for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "messages_select_own_conversation"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  );

create policy "conversation_states_select_own"
  on public.conversation_states for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations
      where conversations.id = conversation_states.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  );

create policy "search_requests_select_own"
  on public.search_requests for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "search_job_sources_select_own"
  on public.search_job_sources for select
  to authenticated
  using (
    exists (
      select 1
      from public.search_jobs
      where search_jobs.id = search_job_sources.search_job_id
        and search_jobs.user_id = (select auth.uid())
    )
  );

create policy "offers_select_own"
  on public.offers for select
  to authenticated
  using (
    exists (
      select 1
      from public.search_jobs
      where search_jobs.id = offers.search_job_id
        and search_jobs.user_id = (select auth.uid())
    )
  );

create policy "usage_events_select_own"
  on public.usage_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.conversation_states to authenticated;
grant select on public.search_requests to authenticated;
grant select on public.search_jobs to authenticated;
grant select on public.search_job_sources to authenticated;
grant select on public.offers to authenticated;
grant select on public.usage_events to authenticated;

revoke all on public.conversations from anon;
revoke all on public.messages from anon;
revoke all on public.conversation_states from anon;
revoke all on public.search_requests from anon;
revoke all on public.search_job_sources from anon;
revoke all on public.offers from anon;
revoke all on public.usage_events from anon;
