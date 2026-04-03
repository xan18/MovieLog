-- Seed: "DCAMU (chronological)"
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
    and c.title_en = 'DCAMU (Chronological)'
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
      'DCAMU (Chronological)',
      '',
      'All DC Animated Movie Universe films sorted by release year.'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 183011, 1), -- Justice League: The Flashpoint Paradox (2013)
    (target_collection_id, 'movie', 217993, 2), -- Justice League: War (2014)
    (target_collection_id, 'movie', 251519, 3), -- Son of Batman (2014)
    (target_collection_id, 'movie', 297556, 4), -- Justice League: Throne of Atlantis (2015)
    (target_collection_id, 'movie', 321528, 5), -- Batman vs. Robin (2015)
    (target_collection_id, 'movie', 366924, 6), -- Batman: Bad Blood (2016)
    (target_collection_id, 'movie', 379291, 7), -- Justice League vs. Teen Titans (2016)
    (target_collection_id, 'movie', 408220, 8), -- Justice League Dark (2017)
    (target_collection_id, 'movie', 408647, 9), -- Teen Titans: The Judas Contract (2017)
    (target_collection_id, 'movie', 487242, 10), -- Suicide Squad: Hell to Pay (2018)
    (target_collection_id, 'movie', 487670, 11), -- The Death of Superman (2018)
    (target_collection_id, 'movie', 539517, 12), -- Constantine: City of Demons - The Movie (2018)
    (target_collection_id, 'movie', 487672, 13), -- Reign of the Supermen (2019)
    (target_collection_id, 'movie', 537056, 14), -- Batman: Hush (2019)
    (target_collection_id, 'movie', 537055, 15), -- Wonder Woman: Bloodlines (2019)
    (target_collection_id, 'movie', 618344, 16) -- Justice League Dark: Apokolips War (2020)
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;
end
$$;
