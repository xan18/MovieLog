-- Seed: "DC Animated - Other (chronological)"
-- Scope:
-- - DC Universe Animated Original Movies (and adjacent entries in the same line)
-- - excludes New 52 / DCAMU first arc and excludes Tomorrowverse
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
    and c.title_en = 'DC Animated - Other (Chronological)'
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
      'DC Animated - Other (Chronological)',
      '',
      'All other DC animated films, excluding New 52/DCAMU and Tomorrowverse.'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 13640, 1),    -- Superman: Doomsday (2007)
    (target_collection_id, 'movie', 14011, 2),    -- Justice League: The New Frontier (2008)
    (target_collection_id, 'movie', 13851, 3),    -- Batman: Gotham Knight (2008)
    (target_collection_id, 'movie', 15359, 4),    -- Wonder Woman (2009)
    (target_collection_id, 'movie', 17445, 5),    -- Green Lantern: First Flight (2009)
    (target_collection_id, 'movie', 22855, 6),    -- Superman/Batman: Public Enemies (2009)
    (target_collection_id, 'movie', 30061, 7),    -- Justice League: Crisis on Two Earths (2010)
    (target_collection_id, 'movie', 40662, 8),    -- Batman: Under the Red Hood (2010)
    (target_collection_id, 'movie', 45162, 9),    -- Superman/Batman: Apocalypse (2010)
    (target_collection_id, 'movie', 56590, 10),   -- All-Star Superman (2011)
    (target_collection_id, 'movie', 65291, 11),   -- Green Lantern: Emerald Knights (2011)
    (target_collection_id, 'movie', 69735, 12),   -- Batman: Year One (2011)
    (target_collection_id, 'movie', 76589, 13),   -- Justice League: Doom (2012)
    (target_collection_id, 'movie', 103269, 14),  -- Superman vs. The Elite (2012)
    (target_collection_id, 'movie', 123025, 15),  -- Batman: The Dark Knight Returns, Part 1 (2012)
    (target_collection_id, 'movie', 142061, 16),  -- Batman: The Dark Knight Returns, Part 2 (2013)
    (target_collection_id, 'movie', 166076, 17),  -- Superman: Unbound (2013)
    (target_collection_id, 'movie', 242643, 18),  -- Batman: Assault on Arkham (2014)
    (target_collection_id, 'movie', 323027, 19),  -- Justice League: Gods and Monsters (2015)
    (target_collection_id, 'movie', 382322, 20),  -- Batman: The Killing Joke (2016)
    (target_collection_id, 'movie', 408648, 21),  -- Batman and Harley Quinn (2017)
    (target_collection_id, 'movie', 471474, 22),  -- Batman: Gotham by Gaslight (2018)
    (target_collection_id, 'movie', 537059, 23),  -- Justice League vs. the Fatal Five (2019)
    (target_collection_id, 'movie', 618355, 24),  -- Superman: Red Son (2020)
    (target_collection_id, 'movie', 703771, 25),  -- Deathstroke: Knights & Dragons - The Movie (2020)
    (target_collection_id, 'movie', 732450, 26),  -- Batman: Soul of the Dragon (2021)
    (target_collection_id, 'movie', 831405, 27),  -- Injustice (2021)
    (target_collection_id, 'movie', 862491, 28),  -- Catwoman: Hunted (2022)
    (target_collection_id, 'movie', 886396, 29),  -- Batman and Superman: Battle of the Super Sons (2022)
    (target_collection_id, 'movie', 1003579, 30), -- Batman: The Doom That Came to Gotham (2023)
    (target_collection_id, 'movie', 1155058, 31), -- Watchmen: Chapter I (2024)
    (target_collection_id, 'movie', 1299652, 32), -- Watchmen: Chapter II (2024)
    (target_collection_id, 'movie', 987400, 33)   -- Aztec Batman: Clash of Empires (2025)
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;
end
$$;
