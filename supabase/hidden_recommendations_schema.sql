-- Run this in Supabase SQL Editor for project:
-- https://hcelucsmnihgelkhpuun.supabase.co

create extension if not exists pgcrypto;

create table if not exists public.hidden_personal_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id bigint not null check (tmdb_id > 0),
  created_at timestamptz not null default now(),
  unique (user_id, media_type, tmdb_id)
);

create index if not exists hidden_personal_recommendations_user_idx
  on public.hidden_personal_recommendations (user_id);

create index if not exists hidden_personal_recommendations_user_created_idx
  on public.hidden_personal_recommendations (user_id, created_at desc);

alter table public.hidden_personal_recommendations enable row level security;

drop policy if exists "Users can read own hidden recommendations" on public.hidden_personal_recommendations;
create policy "Users can read own hidden recommendations"
on public.hidden_personal_recommendations
for select
using (user_id = auth.uid());

drop policy if exists "Users can insert own hidden recommendations" on public.hidden_personal_recommendations;
create policy "Users can insert own hidden recommendations"
on public.hidden_personal_recommendations
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can delete own hidden recommendations" on public.hidden_personal_recommendations;
create policy "Users can delete own hidden recommendations"
on public.hidden_personal_recommendations
for delete
using (user_id = auth.uid());

grant select, insert, delete on public.hidden_personal_recommendations to authenticated;
grant select, insert, delete on public.hidden_personal_recommendations to service_role;
