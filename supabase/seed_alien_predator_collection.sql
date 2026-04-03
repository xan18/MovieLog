-- Seed: "Alien & Predator (chronological)"
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
    and c.title_en = 'Alien & Predator (Chronological)'
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
      'Alien & Predator (Chronological)',
      '',
      'Core Alien and Predator films sorted by release year.'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 348, 1),     -- Alien (1979)
    (target_collection_id, 'movie', 679, 2),     -- Aliens (1986)
    (target_collection_id, 'movie', 106, 3),     -- Predator (1987)
    (target_collection_id, 'movie', 169, 4),     -- Predator 2 (1990)
    (target_collection_id, 'movie', 8077, 5),    -- Alien 3 (1992)
    (target_collection_id, 'movie', 8078, 6),    -- Alien Resurrection (1997)
    (target_collection_id, 'movie', 395, 7),     -- AVP: Alien vs. Predator (2004)
    (target_collection_id, 'movie', 440, 8),     -- Aliens vs Predator: Requiem (2007)
    (target_collection_id, 'movie', 34851, 9),   -- Predators (2010)
    (target_collection_id, 'movie', 70981, 10),  -- Prometheus (2012)
    (target_collection_id, 'movie', 126889, 11), -- Alien: Covenant (2017)
    (target_collection_id, 'movie', 346910, 12), -- The Predator (2018)
    (target_collection_id, 'movie', 766507, 13), -- Prey (2022)
    (target_collection_id, 'movie', 945961, 14)  -- Alien: Romulus (2024)
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;
end
$$;
