-- Adds stable manual ordering for curated collections.
-- Run once on an existing database.

alter table public.curated_collections
  add column if not exists sort_order integer;

with seeded as (
  select
    id,
    row_number() over (
      order by updated_at desc, created_at desc, id asc
    ) as next_sort_order
  from public.curated_collections
)
update public.curated_collections c
set sort_order = seeded.next_sort_order
from seeded
where c.id = seeded.id
  and (c.sort_order is null or c.sort_order <= 0);

with normalized as (
  select
    id,
    row_number() over (
      order by sort_order asc nulls last, updated_at desc, created_at desc, id asc
    ) as next_sort_order
  from public.curated_collections
)
update public.curated_collections c
set sort_order = normalized.next_sort_order
from normalized
where c.id = normalized.id;

alter table public.curated_collections
  alter column sort_order set default 1;

update public.curated_collections
set sort_order = 1
where sort_order is null or sort_order <= 0;

alter table public.curated_collections
  alter column sort_order set not null;

create index if not exists curated_collections_sort_order_idx
  on public.curated_collections (sort_order, updated_at desc, created_at desc);
