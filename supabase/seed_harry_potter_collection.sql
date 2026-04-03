-- Seed: "Harry Potter (chronological)"
-- Run in Supabase SQL Editor (service role context).
-- The script is idempotent:
-- - creates collection if missing
-- - upserts items with fixed sort_order by release year

do $$
declare
  target_owner uuid;
  target_collection_id uuid;
begin
  select r.user_id
    into target_owner
  from public.app_user_roles r
  where r.role_name in ('admin', 'author')
  order by
    case when r.role_name = 'admin' then 0 else 1 end,
    r.created_at asc
  limit 1;

  if target_owner is null then
    raise exception 'No user with author/admin role found in public.app_user_roles';
  end if;

  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Harry Potter (Chronological)'
  limit 1;

  if target_collection_id is null then
    insert into public.curated_collections (
      owner_user_id,
      visibility,
      title_ru,
      title_en,
      description_ru,
      description_en
    ) values (
      target_owner,
      'public',
      '',
      'Harry Potter (Chronological)',
      '',
      'All 8 Harry Potter films sorted by release year.'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 671, 1),    -- Philosopher's Stone (2001)
    (target_collection_id, 'movie', 672, 2),    -- Chamber of Secrets (2002)
    (target_collection_id, 'movie', 673, 3),    -- Prisoner of Azkaban (2004)
    (target_collection_id, 'movie', 674, 4),    -- Goblet of Fire (2005)
    (target_collection_id, 'movie', 675, 5),    -- Order of the Phoenix (2007)
    (target_collection_id, 'movie', 767, 6),    -- Half-Blood Prince (2009)
    (target_collection_id, 'movie', 12444, 7),  -- Deathly Hallows: Part 1 (2010)
    (target_collection_id, 'movie', 12445, 8)   -- Deathly Hallows: Part 2 (2011)
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;
end
$$;
