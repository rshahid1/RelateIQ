-- RelateIQ — Supabase schema
-- Paste this into your Supabase project: SQL Editor → New query → Run.
-- Every table is private per-user via Row-Level Security (RLS).

create extension if not exists "pgcrypto";

-- ── Contacts ────────────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  first_name    text not null default '',
  last_name     text not null default '',
  email         text,
  phone         text,
  company       text,
  title         text,
  city          text,
  state         text,
  country       text,
  birthday      date,
  linkedin_url  text,
  avatar_url    text,
  tags          text[] not null default '{}',
  notes         text,
  last_contacted date,
  tier          text check (tier in ('key','standard','low')),
  ticker        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Life events ─────────────────────────────────────────────────────────────
create table if not exists public.life_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  title         text not null,
  description   text,
  event_date    date not null,
  recurring     boolean not null default false,
  category      text not null default 'other',
  notify_before_days int,
  created_at    timestamptz not null default now()
);

-- ── Meeting notes ───────────────────────────────────────────────────────────
create table if not exists public.meeting_notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  title         text not null,
  content       text not null default '',
  meeting_date  date not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Reflections (Playbook) ──────────────────────────────────────────────────
create table if not exists public.reflections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  content       text not null,
  category      text not null default 'note',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Conferences ─────────────────────────────────────────────────────────────
create table if not exists public.conferences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  date          date not null,
  location      text,
  description   text,
  url           text,
  created_at    timestamptz not null default now()
);

-- ── Done commitments (promise checkboxes) ────────────────────────────────────
create table if not exists public.done_commitments (
  user_id       uuid not null references auth.users(id) on delete cascade,
  commitment_id text not null,
  primary key (user_id, commitment_id)
);

-- ── Row-Level Security: each user sees only their own rows ────────────────────
do $$
declare t text;
begin
  foreach t in array array['contacts','life_events','meeting_notes','reflections','conferences','done_commitments']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "owner_all" on public.%I;', t);
    execute format(
      'create policy "owner_all" on public.%I
         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;

-- ── Helpful indexes ───────────────────────────────────────────────────────────
create index if not exists idx_contacts_user      on public.contacts(user_id);
create index if not exists idx_life_events_contact on public.life_events(contact_id);
create index if not exists idx_notes_contact       on public.meeting_notes(contact_id);
create index if not exists idx_reflections_user    on public.reflections(user_id);
create index if not exists idx_conferences_user    on public.conferences(user_id);
