-- Run this in Supabase SQL Editor for project:
-- https://hcelucsmnihgelkhpuun.supabase.co

create extension if not exists pgcrypto;

create table if not exists public.curated_collections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  title_ru text not null default '',
  title_en text not null default '',
  description_ru text not null default '',
  description_en text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curated_collections_has_title check (
    length(trim(title_ru)) > 0 or length(trim(title_en)) > 0
  )
);

create table if not exists public.curated_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.curated_collections(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id bigint not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  unique (collection_id, media_type, tmdb_id)
);

create index if not exists curated_collection_items_collection_idx
  on public.curated_collection_items (collection_id, sort_order, created_at);

create or replace function public.set_curated_collections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_curated_collections_updated_at on public.curated_collections;

create trigger trg_curated_collections_updated_at
before update on public.curated_collections
for each row
execute function public.set_curated_collections_updated_at();

alter table public.curated_collections enable row level security;
alter table public.curated_collection_items enable row level security;

drop policy if exists "Collections visible to owner or public" on public.curated_collections;
create policy "Collections visible to owner or public"
on public.curated_collections
for select
using (
  visibility = 'public'
  or owner_user_id = auth.uid()
  or lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
);

drop policy if exists "Author can insert collections" on public.curated_collections;
create policy "Author can insert collections"
on public.curated_collections
for insert
with check (
  owner_user_id = auth.uid()
  and lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
);

drop policy if exists "Author can update own collections" on public.curated_collections;
create policy "Author can update own collections"
on public.curated_collections
for update
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
);

drop policy if exists "Author can delete own collections" on public.curated_collections;
create policy "Author can delete own collections"
on public.curated_collections
for delete
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
);

drop policy if exists "Collection items visible by parent access" on public.curated_collection_items;
create policy "Collection items visible by parent access"
on public.curated_collection_items
for select
using (
  exists (
    select 1
    from public.curated_collections c
    where c.id = collection_id
      and (
        c.visibility = 'public'
        or c.owner_user_id = auth.uid()
        or lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
      )
  )
);

drop policy if exists "Author can insert items for own collections" on public.curated_collection_items;
create policy "Author can insert items for own collections"
on public.curated_collection_items
for insert
with check (
  exists (
    select 1
    from public.curated_collections c
    where c.id = collection_id
      and lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
  )
);

drop policy if exists "Author can update items for own collections" on public.curated_collection_items;
create policy "Author can update items for own collections"
on public.curated_collection_items
for update
using (
  exists (
    select 1
    from public.curated_collections c
    where c.id = collection_id
      and lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
  )
)
with check (
  exists (
    select 1
    from public.curated_collections c
    where c.id = collection_id
      and lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
  )
);

drop policy if exists "Author can delete items for own collections" on public.curated_collection_items;
create policy "Author can delete items for own collections"
on public.curated_collection_items
for delete
using (
  exists (
    select 1
    from public.curated_collections c
    where c.id = collection_id
      and lower(coalesce(auth.jwt() ->> 'email', '')) in ('umar18main@gmail.com', 'lagerfeed050@gmail.com')
  )
);

grant select, insert, update, delete on public.curated_collections to authenticated;
grant select, insert, update, delete on public.curated_collection_items to authenticated;
