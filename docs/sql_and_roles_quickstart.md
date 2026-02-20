# SQL + Roles Quickstart

1. Open Supabase SQL Editor.
2. Run:
   - `supabase/collections_schema.sql`
   - `supabase/library_items_schema.sql`
3. Grant author role:

```sql
insert into public.app_user_roles (user_id, role_name)
select id, 'author'
from auth.users
where lower(email) = lower('user@example.com')
on conflict (user_id, role_name) do nothing;
```

4. Log in as that user and enable Author Mode in app settings.
