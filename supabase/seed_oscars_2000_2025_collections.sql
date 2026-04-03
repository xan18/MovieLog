-- Seed: "Oscars 2000-2025 Best Picture collections"
-- Creates 26 collections: Oscars 2000 ... Oscars 2025
-- Each collection contains Best Picture nominees (winner first).
-- Run in Supabase SQL Editor (service role context).
-- Idempotent: safe to re-run.

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

  -- Oscars 2000
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2000 - Best Picture'
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
      'Oscars 2000 - Best Picture',
      '',
      'Academy Awards 2000 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 14, 1), -- American Beauty
    (target_collection_id, 'movie', 1715, 2), -- The Cider House Rules
    (target_collection_id, 'movie', 497, 3), -- The Green Mile
    (target_collection_id, 'movie', 9008, 4), -- The Insider
    (target_collection_id, 'movie', 745, 5) -- The Sixth Sense
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2001
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2001 - Best Picture'
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
      'Oscars 2001 - Best Picture',
      '',
      'Academy Awards 2001 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 98, 1), -- Gladiator
    (target_collection_id, 'movie', 392, 2), -- Chocolat
    (target_collection_id, 'movie', 146, 3), -- Crouching Tiger, Hidden Dragon
    (target_collection_id, 'movie', 462, 4), -- Erin Brockovich
    (target_collection_id, 'movie', 1900, 5) -- Traffic
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2002
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2002 - Best Picture'
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
      'Oscars 2002 - Best Picture',
      '',
      'Academy Awards 2002 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 453, 1), -- A Beautiful Mind
    (target_collection_id, 'movie', 5279, 2), -- Gosford Park
    (target_collection_id, 'movie', 1999, 3), -- In the Bedroom
    (target_collection_id, 'movie', 120, 4), -- The Lord of the Rings: The Fellowship of the Ring
    (target_collection_id, 'movie', 824, 5) -- Moulin Rouge!
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2003
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2003 - Best Picture'
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
      'Oscars 2003 - Best Picture',
      '',
      'Academy Awards 2003 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 1574, 1), -- Chicago
    (target_collection_id, 'movie', 3131, 2), -- Gangs of New York
    (target_collection_id, 'movie', 590, 3), -- The Hours
    (target_collection_id, 'movie', 121, 4), -- The Lord of the Rings: The Two Towers
    (target_collection_id, 'movie', 423, 5) -- The Pianist
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2004
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2004 - Best Picture'
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
      'Oscars 2004 - Best Picture',
      '',
      'Academy Awards 2004 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 122, 1), -- The Lord of the Rings: The Return of the King
    (target_collection_id, 'movie', 153, 2), -- Lost in Translation
    (target_collection_id, 'movie', 8619, 3), -- Master and Commander: The Far Side of the World
    (target_collection_id, 'movie', 322, 4), -- Mystic River
    (target_collection_id, 'movie', 4464, 5) -- Seabiscuit
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2005
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2005 - Best Picture'
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
      'Oscars 2005 - Best Picture',
      '',
      'Academy Awards 2005 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 70, 1), -- Million Dollar Baby
    (target_collection_id, 'movie', 2567, 2), -- The Aviator
    (target_collection_id, 'movie', 866, 3), -- Finding Neverland
    (target_collection_id, 'movie', 1677, 4), -- Ray
    (target_collection_id, 'movie', 9675, 5) -- Sideways
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2006
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2006 - Best Picture'
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
      'Oscars 2006 - Best Picture',
      '',
      'Academy Awards 2006 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 1640, 1), -- Crash
    (target_collection_id, 'movie', 142, 2), -- Brokeback Mountain
    (target_collection_id, 'movie', 398, 3), -- Capote
    (target_collection_id, 'movie', 3291, 4), -- Good Night, and Good Luck
    (target_collection_id, 'movie', 612, 5) -- Munich
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2007
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2007 - Best Picture'
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
      'Oscars 2007 - Best Picture',
      '',
      'Academy Awards 2007 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 1422, 1), -- The Departed
    (target_collection_id, 'movie', 1164, 2), -- Babel
    (target_collection_id, 'movie', 1251, 3), -- Letters from Iwo Jima
    (target_collection_id, 'movie', 773, 4), -- Little Miss Sunshine
    (target_collection_id, 'movie', 1165, 5) -- The Queen
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2008
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2008 - Best Picture'
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
      'Oscars 2008 - Best Picture',
      '',
      'Academy Awards 2008 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 6977, 1), -- No Country for Old Men
    (target_collection_id, 'movie', 4347, 2), -- Atonement
    (target_collection_id, 'movie', 7326, 3), -- Juno
    (target_collection_id, 'movie', 4566, 4), -- Michael Clayton
    (target_collection_id, 'movie', 7345, 5) -- There Will Be Blood
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2009
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2009 - Best Picture'
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
      'Oscars 2009 - Best Picture',
      '',
      'Academy Awards 2009 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 12405, 1), -- Slumdog Millionaire
    (target_collection_id, 'movie', 4922, 2), -- The Curious Case of Benjamin Button
    (target_collection_id, 'movie', 11499, 3), -- Frost/Nixon
    (target_collection_id, 'movie', 10139, 4), -- Milk
    (target_collection_id, 'movie', 8055, 5) -- The Reader
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2010
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2010 - Best Picture'
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
      'Oscars 2010 - Best Picture',
      '',
      'Academy Awards 2010 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 12162, 1), -- The Hurt Locker
    (target_collection_id, 'movie', 19995, 2), -- Avatar
    (target_collection_id, 'movie', 22881, 3), -- The Blind Side
    (target_collection_id, 'movie', 17654, 4), -- District 9
    (target_collection_id, 'movie', 24684, 5), -- An Education
    (target_collection_id, 'movie', 16869, 6), -- Inglourious Basterds
    (target_collection_id, 'movie', 25793, 7), -- Precious: Based on the Novel "Push" by Sapphire
    (target_collection_id, 'movie', 12573, 8), -- A Serious Man
    (target_collection_id, 'movie', 14160, 9), -- Up
    (target_collection_id, 'movie', 22947, 10) -- Up in the Air
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2011
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2011 - Best Picture'
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
      'Oscars 2011 - Best Picture',
      '',
      'Academy Awards 2011 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 45269, 1), -- The King's Speech
    (target_collection_id, 'movie', 44214, 2), -- Black Swan
    (target_collection_id, 'movie', 45317, 3), -- The Fighter
    (target_collection_id, 'movie', 27205, 4), -- Inception
    (target_collection_id, 'movie', 39781, 5), -- The Kids Are All Right
    (target_collection_id, 'movie', 44115, 6), -- 127 Hours
    (target_collection_id, 'movie', 37799, 7), -- The Social Network
    (target_collection_id, 'movie', 10193, 8), -- Toy Story 3
    (target_collection_id, 'movie', 44264, 9), -- True Grit
    (target_collection_id, 'movie', 39013, 10) -- Winter's Bone
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2012
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2012 - Best Picture'
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
      'Oscars 2012 - Best Picture',
      '',
      'Academy Awards 2012 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 74643, 1), -- The Artist
    (target_collection_id, 'movie', 65057, 2), -- The Descendants
    (target_collection_id, 'movie', 64685, 3), -- Extremely Loud & Incredibly Close
    (target_collection_id, 'movie', 50014, 4), -- The Help
    (target_collection_id, 'movie', 44826, 5), -- Hugo
    (target_collection_id, 'movie', 59436, 6), -- Midnight in Paris
    (target_collection_id, 'movie', 60308, 7), -- Moneyball
    (target_collection_id, 'movie', 8967, 8), -- The Tree of Life
    (target_collection_id, 'movie', 57212, 9) -- War Horse
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2013
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2013 - Best Picture'
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
      'Oscars 2013 - Best Picture',
      '',
      'Academy Awards 2013 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 68734, 1), -- Argo
    (target_collection_id, 'movie', 86837, 2), -- Amour
    (target_collection_id, 'movie', 84175, 3), -- Beasts of the Southern Wild
    (target_collection_id, 'movie', 68718, 4), -- Django Unchained
    (target_collection_id, 'movie', 87827, 5), -- Life of Pi
    (target_collection_id, 'movie', 72976, 6), -- Lincoln
    (target_collection_id, 'movie', 82695, 7), -- Les Miserables
    (target_collection_id, 'movie', 82693, 8), -- Silver Linings Playbook
    (target_collection_id, 'movie', 97630, 9) -- Zero Dark Thirty
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2014
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2014 - Best Picture'
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
      'Oscars 2014 - Best Picture',
      '',
      'Academy Awards 2014 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 76203, 1), -- 12 Years a Slave
    (target_collection_id, 'movie', 168672, 2), -- American Hustle
    (target_collection_id, 'movie', 109424, 3), -- Captain Phillips
    (target_collection_id, 'movie', 152532, 4), -- Dallas Buyers Club
    (target_collection_id, 'movie', 49047, 5), -- Gravity
    (target_collection_id, 'movie', 152601, 6), -- Her
    (target_collection_id, 'movie', 129670, 7), -- Nebraska
    (target_collection_id, 'movie', 205220, 8), -- Philomena
    (target_collection_id, 'movie', 106646, 9) -- The Wolf of Wall Street
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2015
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2015 - Best Picture'
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
      'Oscars 2015 - Best Picture',
      '',
      'Academy Awards 2015 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 194662, 1), -- Birdman or (The Unexpected Virtue of Ignorance)
    (target_collection_id, 'movie', 190859, 2), -- American Sniper
    (target_collection_id, 'movie', 85350, 3), -- Boyhood
    (target_collection_id, 'movie', 120467, 4), -- The Grand Budapest Hotel
    (target_collection_id, 'movie', 205596, 5), -- The Imitation Game
    (target_collection_id, 'movie', 273895, 6), -- Selma
    (target_collection_id, 'movie', 266856, 7), -- The Theory of Everything
    (target_collection_id, 'movie', 244786, 8) -- Whiplash
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2016
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2016 - Best Picture'
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
      'Oscars 2016 - Best Picture',
      '',
      'Academy Awards 2016 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 314365, 1), -- Spotlight
    (target_collection_id, 'movie', 318846, 2), -- The Big Short
    (target_collection_id, 'movie', 296098, 3), -- Bridge of Spies
    (target_collection_id, 'movie', 167073, 4), -- Brooklyn
    (target_collection_id, 'movie', 76341, 5), -- Mad Max: Fury Road
    (target_collection_id, 'movie', 286217, 6), -- The Martian
    (target_collection_id, 'movie', 281957, 7), -- The Revenant
    (target_collection_id, 'movie', 264644, 8) -- Room
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2017
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2017 - Best Picture'
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
      'Oscars 2017 - Best Picture',
      '',
      'Academy Awards 2017 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 376867, 1), -- Moonlight
    (target_collection_id, 'movie', 329865, 2), -- Arrival
    (target_collection_id, 'movie', 393457, 3), -- Fences
    (target_collection_id, 'movie', 324786, 4), -- Hacksaw Ridge
    (target_collection_id, 'movie', 338766, 5), -- Hell or High Water
    (target_collection_id, 'movie', 381284, 6), -- Hidden Figures
    (target_collection_id, 'movie', 313369, 7), -- La La Land
    (target_collection_id, 'movie', 334543, 8), -- Lion
    (target_collection_id, 'movie', 334541, 9) -- Manchester by the Sea
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2018
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2018 - Best Picture'
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
      'Oscars 2018 - Best Picture',
      '',
      'Academy Awards 2018 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 399055, 1), -- The Shape of Water
    (target_collection_id, 'movie', 398818, 2), -- Call Me by Your Name
    (target_collection_id, 'movie', 399404, 3), -- Darkest Hour
    (target_collection_id, 'movie', 374720, 4), -- Dunkirk
    (target_collection_id, 'movie', 419430, 5), -- Get Out
    (target_collection_id, 'movie', 391713, 6), -- Lady Bird
    (target_collection_id, 'movie', 400617, 7), -- Phantom Thread
    (target_collection_id, 'movie', 446354, 8), -- The Post
    (target_collection_id, 'movie', 359940, 9) -- Three Billboards Outside Ebbing, Missouri
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2019
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2019 - Best Picture'
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
      'Oscars 2019 - Best Picture',
      '',
      'Academy Awards 2019 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 490132, 1), -- Green Book
    (target_collection_id, 'movie', 284054, 2), -- Black Panther
    (target_collection_id, 'movie', 487558, 3), -- BlacKkKlansman
    (target_collection_id, 'movie', 424694, 4), -- Bohemian Rhapsody
    (target_collection_id, 'movie', 375262, 5), -- The Favourite
    (target_collection_id, 'movie', 426426, 6), -- Roma
    (target_collection_id, 'movie', 332562, 7), -- A Star Is Born
    (target_collection_id, 'movie', 429197, 8) -- Vice
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2020
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2020 - Best Picture'
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
      'Oscars 2020 - Best Picture',
      '',
      'Academy Awards 2020 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 496243, 1), -- Parasite
    (target_collection_id, 'movie', 359724, 2), -- Ford v Ferrari
    (target_collection_id, 'movie', 398978, 3), -- The Irishman
    (target_collection_id, 'movie', 515001, 4), -- Jojo Rabbit
    (target_collection_id, 'movie', 475557, 5), -- Joker
    (target_collection_id, 'movie', 331482, 6), -- Little Women
    (target_collection_id, 'movie', 492188, 7), -- Marriage Story
    (target_collection_id, 'movie', 530915, 8), -- 1917
    (target_collection_id, 'movie', 466272, 9) -- Once Upon a Time in Hollywood
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2021
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2021 - Best Picture'
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
      'Oscars 2021 - Best Picture',
      '',
      'Academy Awards 2021 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 581734, 1), -- Nomadland
    (target_collection_id, 'movie', 600354, 2), -- The Father
    (target_collection_id, 'movie', 583406, 3), -- Judas and the Black Messiah
    (target_collection_id, 'movie', 614560, 4), -- Mank
    (target_collection_id, 'movie', 615643, 5), -- Minari
    (target_collection_id, 'movie', 582014, 6), -- Promising Young Woman
    (target_collection_id, 'movie', 502033, 7), -- Sound of Metal
    (target_collection_id, 'movie', 556984, 8) -- The Trial of the Chicago 7
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2022
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2022 - Best Picture'
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
      'Oscars 2022 - Best Picture',
      '',
      'Academy Awards 2022 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 776503, 1), -- CODA
    (target_collection_id, 'movie', 777270, 2), -- Belfast
    (target_collection_id, 'movie', 646380, 3), -- Don't Look Up
    (target_collection_id, 'movie', 758866, 4), -- Drive My Car
    (target_collection_id, 'movie', 438631, 5), -- Dune
    (target_collection_id, 'movie', 614917, 6), -- King Richard
    (target_collection_id, 'movie', 718032, 7), -- Licorice Pizza
    (target_collection_id, 'movie', 597208, 8), -- Nightmare Alley
    (target_collection_id, 'movie', 600583, 9), -- The Power of the Dog
    (target_collection_id, 'movie', 511809, 10) -- West Side Story
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2023
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2023 - Best Picture'
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
      'Oscars 2023 - Best Picture',
      '',
      'Academy Awards 2023 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 545611, 1), -- Everything Everywhere All at Once
    (target_collection_id, 'movie', 49046, 2), -- All Quiet on the Western Front
    (target_collection_id, 'movie', 76600, 3), -- Avatar: The Way of Water
    (target_collection_id, 'movie', 674324, 4), -- The Banshees of Inisherin
    (target_collection_id, 'movie', 614934, 5), -- Elvis
    (target_collection_id, 'movie', 804095, 6), -- The Fabelmans
    (target_collection_id, 'movie', 817758, 7), -- Tar
    (target_collection_id, 'movie', 361743, 8), -- Top Gun: Maverick
    (target_collection_id, 'movie', 497828, 9), -- Triangle of Sadness
    (target_collection_id, 'movie', 777245, 10) -- Women Talking
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2024
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2024 - Best Picture'
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
      'Oscars 2024 - Best Picture',
      '',
      'Academy Awards 2024 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 872585, 1), -- Oppenheimer
    (target_collection_id, 'movie', 1056360, 2), -- American Fiction
    (target_collection_id, 'movie', 915935, 3), -- Anatomy of a Fall
    (target_collection_id, 'movie', 346698, 4), -- Barbie
    (target_collection_id, 'movie', 840430, 5), -- The Holdovers
    (target_collection_id, 'movie', 466420, 6), -- Killers of the Flower Moon
    (target_collection_id, 'movie', 523607, 7), -- Maestro
    (target_collection_id, 'movie', 666277, 8), -- Past Lives
    (target_collection_id, 'movie', 792307, 9), -- Poor Things
    (target_collection_id, 'movie', 467244, 10) -- The Zone of Interest
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

  -- Oscars 2025
  select c.id
    into target_collection_id
  from public.curated_collections c
  where c.owner_user_id = target_owner
    and c.title_en = 'Oscars 2025 - Best Picture'
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
      'Oscars 2025 - Best Picture',
      '',
      'Academy Awards 2025 Best Picture nominees (winner first).'
    )
    returning id into target_collection_id;
  end if;

  insert into public.curated_collection_items (
    collection_id,
    media_type,
    tmdb_id,
    sort_order
  ) values
    (target_collection_id, 'movie', 1064213, 1), -- Anora
    (target_collection_id, 'movie', 549509, 2), -- The Brutalist
    (target_collection_id, 'movie', 661539, 3), -- A Complete Unknown
    (target_collection_id, 'movie', 974576, 4), -- Conclave
    (target_collection_id, 'movie', 693134, 5), -- Dune: Part Two
    (target_collection_id, 'movie', 974950, 6), -- Emilia Perez
    (target_collection_id, 'movie', 1000837, 7), -- I'm Still Here
    (target_collection_id, 'movie', 1028196, 8), -- Nickel Boys
    (target_collection_id, 'movie', 933260, 9), -- The Substance
    (target_collection_id, 'movie', 402431, 10) -- Wicked
  on conflict (collection_id, media_type, tmdb_id)
  do update set
    sort_order = excluded.sort_order;

end
$$;
