# Collections + Roles Setup

## 1) Apply SQL migrations

Run these scripts in Supabase SQL Editor:

1. `supabase/collections_schema.sql`
2. `supabase/library_items_schema.sql`

What you get:

- Role table: `public.app_user_roles`
- Curated tables: `public.curated_collections`, `public.curated_collection_items`
- Personal cloud library table: `public.library_items`
- RLS policies for per-user library and role-based collection management

## 2) Grant role to a user

Use SQL Editor (service role context) and replace the email:

```sql
insert into public.app_user_roles (user_id, role_name)
select id, 'author'
from auth.users
where lower(email) = lower('user@example.com')
on conflict (user_id, role_name) do nothing;
```

Available roles:

- `author`: can manage own collections
- `admin`: can manage all collections

To grant admin:

```sql
insert into public.app_user_roles (user_id, role_name)
select id, 'admin'
from auth.users
where lower(email) = lower('user@example.com')
on conflict (user_id, role_name) do nothing;
```

## 3) Frontend behavior

- Any signed-in user can read public collections.
- A user with `author` or `admin` role can enable Author Mode in UI and create/edit collections.
- Cloud library sync reads/writes only current user's rows in `library_items`.
