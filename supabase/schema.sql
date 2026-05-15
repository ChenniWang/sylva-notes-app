-- Sylva: one row per user, JSON columns mirror localStorage.
-- Run this in Supabase → SQL Editor → New query → Run.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hole_notes jsonb not null default '[]'::jsonb,
  user_tasks jsonb not null default '[]'::jsonb,
  note_tags jsonb not null default '[]'::jsonb,
  task_tags jsonb not null default '[]'::jsonb,
  app_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "user_data_select_own"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "user_data_insert_own"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "user_data_update_own"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The app sets updated_at on each upsert. (Avoids trigger syntax differences across Postgres versions.)

-- Dashboard tips (not SQL):
-- Authentication → Providers: enable Email.
-- For testing, Authentication → Providers → Email → disable "Confirm email" so sign-up can log in immediately.
-- When you deploy to a real HTTPS URL, add that URL under Authentication → URL configuration → Site URL / Redirect URLs.
