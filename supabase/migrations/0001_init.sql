-- ════════════════════════════════════════════════════════════════
-- JARVIS — initial schema. Applied to project `jarvis` (prowyutfsxvdlczpbpip).
--
-- Single-user system: every table is RLS-locked to the owner's uid.
-- The server (service-role key) bypasses RLS for node dispatch, cron,
-- and audit writes. Node agents never talk to Postgres directly — they
-- ride Supabase Realtime and the server mediates.
-- ════════════════════════════════════════════════════════════════

create extension if not exists vector;      -- pgvector (memory)
create extension if not exists pgcrypto;    -- gen_random_uuid()

-- ── profiles: the one user + settings ───────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  timezone      text        not null default 'America/Detroit',
  briefing_time time        not null default '07:00',
  settings      jsonb       not null default '{}',
  created_at    timestamptz not null default now()
);

-- ── memories: pgvector long-term memory ─────────────────────────
-- DECISION #1 (locked): Supabase gte-small → vector(384). Free, no new
-- vendor. Upgrade path: swap provider + widen this column, then re-embed.
create table memories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in ('fact','preference','summary')),
  content    text not null,
  embedding  vector(384),
  source     text,                       -- e.g. 'chat', 'remember-command'
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on memories using hnsw (embedding vector_cosine_ops);
create index on memories (user_id, kind);

-- ── conversations + messages ────────────────────────────────────
create table conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  client     text not null check (client in ('desktop','phone','car')),
  title      text,
  started_at timestamptz not null default now()
);
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','tool')),
  content         jsonb not null,
  created_at      timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

-- ── tasks / reminders ───────────────────────────────────────────
create table tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text not null,
  notes      text,
  due_at     timestamptz,
  remind_at  timestamptz,
  status     text not null default 'open' check (status in ('open','done','snoozed')),
  created_at timestamptz not null default now()
);
create index on tasks (user_id, status, remind_at);

-- ── notes ───────────────────────────────────────────────────────
create table notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── devices: the 4 JARVIS nodes ─────────────────────────────────
create table devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  name            text not null,          -- friendly: 'MacBook','HP','Samsung','ROG'
  os              text not null check (os in ('macos','windows')),
  online          boolean not null default false,
  last_seen       timestamptz,
  battery         int,
  capabilities    jsonb not null default '[]',
  device_key_hash text not null,          -- raw key shown once at pairing
  revoked         boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (user_id, name)
);

-- ── device_commands: dispatch + lifecycle + confirmation ────────
create table device_commands (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  device_id     uuid references devices(id) on delete set null,
  type          text not null,            -- see @jarvis/shared DeviceCommandType
  args          jsonb not null default '{}',
  status        text not null default 'pending'
                  check (status in ('pending','confirmed','sent','running','done','error','denied')),
  result        jsonb,
  requested_at  timestamptz not null default now(),
  confirmed_at  timestamptz,
  completed_at  timestamptz
);
create index on device_commands (user_id, status, requested_at);

-- ── routines: approved multi-step device sequences ─────────────
create table routines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  name         text not null,
  target_device text,
  steps        jsonb not null default '[]',
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ── audit_log: every tool call & device command ────────────────
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  actor         text not null,            -- 'desktop','phone','car','cron'
  action        text not null,            -- tool name or command type
  target_device text,
  payload       jsonb,
  result        jsonb,
  created_at    timestamptz not null default now()
);
create index on audit_log (user_id, created_at desc);

-- ── alerts: proactive notifications ─────────────────────────────
create table alerts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,               -- 'calendar','deadline','device','briefing'
  title      text not null,
  body       text,
  sent_via   text[] not null default '{}', -- {'push','email'}
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── push_subscriptions: web push endpoints ─────────────────────
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,              -- { p256dh, auth }
  ua         text,
  created_at timestamptz not null default now()
);

-- ── tesla_tokens: OAuth (wired later) ──────────────────────────
create table tesla_tokens (
  user_id       uuid primary key references profiles(id) on delete cascade,
  access_token  text,                     -- encrypted at rest
  refresh_token text,                     -- encrypted at rest
  vehicle_id    text,
  updated_at    timestamptz not null default now()
);

-- ── RLS: lock every table to the owner ─────────────────────────
alter table profiles           enable row level security;
alter table memories           enable row level security;
alter table conversations      enable row level security;
alter table messages           enable row level security;
alter table tasks              enable row level security;
alter table notes              enable row level security;
alter table devices            enable row level security;
alter table device_commands    enable row level security;
alter table routines           enable row level security;
alter table audit_log          enable row level security;
alter table alerts             enable row level security;
alter table push_subscriptions enable row level security;
alter table tesla_tokens       enable row level security;

create policy "owner" on profiles           using (auth.uid() = id)      with check (auth.uid() = id);
create policy "owner" on memories           using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on conversations      using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on tasks              using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on notes              using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on devices            using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on device_commands    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on routines           using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on audit_log          using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on alerts             using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on push_subscriptions using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on tesla_tokens       using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- messages: scoped through its parent conversation's owner
create policy "owner" on messages using (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())
);
