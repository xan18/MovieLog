-- Allow RAWG games to use the existing per-user cloud library.
-- For game rows, tmdb_id stores the RAWG game id.

alter table public.library_items
  drop constraint if exists library_items_media_type_check;

alter table public.library_items
  add constraint library_items_media_type_check
  check (media_type in ('movie', 'tv', 'game'));
