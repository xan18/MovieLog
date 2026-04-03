-- Seed: "Tomorrowverse (chronological)"
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
    and c.title_en = 'Tomorrowverse (Chronological)'
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
      'Tomorrowverse (Chronological)',
      '',
      'All Tomorrowverse films sorted by release year.'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 618354, 1),  -- Superman: Man of Tomorrow (2020)
    (target_collection_id, 'movie', 736069, 2),  -- Justice Society: World War II (2021)
    (target_collection_id, 'movie', 736073, 3),  -- Batman: The Long Halloween, Part One (2021)
    (target_collection_id, 'movie', 736074, 4),  -- Batman: The Long Halloween, Part Two (2021)
    (target_collection_id, 'movie', 887357, 5),  -- Green Lantern: Beware My Power (2022)
    (target_collection_id, 'movie', 1003580, 6), -- Legion of Super-Heroes (2023)
    (target_collection_id, 'movie', 1003581, 7), -- Justice League: Warworld (2023)
    (target_collection_id, 'movie', 1155089, 8), -- Justice League: Crisis on Infinite Earths - Part One (2024)
    (target_collection_id, 'movie', 1209288, 9), -- Justice League: Crisis on Infinite Earths - Part Two (2024)
    (target_collection_id, 'movie', 1209290, 10) -- Justice League: Crisis on Infinite Earths - Part Three (2024)
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;
end
$$;
