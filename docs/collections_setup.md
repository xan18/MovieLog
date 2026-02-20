# Collections Setup

## 1) Apply database schema

1. Open Supabase SQL Editor for your project.
2. Run `supabase/collections_schema.sql`.

This creates:
- `curated_collections`
- `curated_collection_items`
- RLS policies where admin emails (`umar18main@gmail.com`, `lagerfeed050@gmail.com`) can manage collections, including each other's collections.

## 2) Redeploy app

After pushing code changes, Vercel auto-deploy is enough.
No new environment variables are required.

## 3) Author flow

1. Sign in as one of the admin emails (`umar18main@gmail.com` or `lagerfeed050@gmail.com`).
2. Open tab `Collections`.
3. Create collection:
   - RU/EN title
   - RU/EN description
   - visibility: `Public` or `Private`
4. Add movie/TV entries by search.
5. Reorder or remove entries in the same tab.
6. Admins can edit/delete collections created by another admin.

## 4) User flow

Regular users can:
- open the `Collections` tab
- view public collections
- open title details
- add titles to personal library

Regular users cannot create/edit/delete collections.
