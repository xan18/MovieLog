-- Run this in Supabase SQL Editor for project:
-- https://hcelucsmnihgelkhpuun.supabase.co

create extension if not exists pgcrypto;

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id bigint not null check (tmdb_id > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, media_type, tmdb_id)
);

create index if not exists library_items_user_idx
  on public.library_items (user_id);

create index if not exists library_items_user_media_idx
  on public.library_items (user_id, media_type);

create index if not exists library_items_user_updated_at_idx
  on public.library_items (user_id, updated_at desc);

create or replace function public.set_library_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_library_items_updated_at on public.library_items;

create trigger trg_library_items_updated_at
before update on public.library_items
for each row
execute function public.set_library_items_updated_at();

alter table public.library_items enable row level security;

drop policy if exists "Users can read own library items" on public.library_items;
create policy "Users can read own library items"
on public.library_items
for select
using (user_id = auth.uid());

drop policy if exists "Users can insert own library items" on public.library_items;
create policy "Users can insert own library items"
on public.library_items
for insert
with check (user_id = auth.uid());

drop policy if exists "Users can update own library items" on public.library_items;
create policy "Users can update own library items"
on public.library_items
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own library items" on public.library_items;
create policy "Users can delete own library items"
on public.library_items
for delete
using (user_id = auth.uid());

grant select, insert, update, delete on public.library_items to authenticated;
grant select, insert, update, delete on public.library_items to service_role;
