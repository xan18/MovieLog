-- Delete exactly 26 Oscar collections:
-- "Oscars 2000 - Best Picture" ... "Oscars 2025 - Best Picture"
-- Safe to re-run.
-- Note: curated_collection_items rows are removed automatically via ON DELETE CASCADE.

delete from public.curated_collections
where title_en = any (
  array(
    select format('Oscars %s - Best Picture', y)
    from generate_series(2000, 2025) as y
  )
);
