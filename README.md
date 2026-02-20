# MovieLog v27

MovieLog is a React + Vite app for tracking movies and TV shows.

## Stack

- React 18
- Vite 5
- Tailwind CSS
- Supabase (Auth + Postgres)
- TMDB API

## Requirements

- Node.js 18+
- npm 9+

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set values:

```bash
VITE_TMDB_API_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

3. Apply SQL in Supabase SQL Editor (in this order):

- `supabase/collections_schema.sql`
- `supabase/library_items_schema.sql`

4. (Optional) Grant yourself author/admin role. See `docs/collections_setup.md`.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run test
npm run typecheck
```

## Supabase Notes

- `collections_schema.sql` creates:
  - `app_user_roles`
  - `curated_collections`
  - `curated_collection_items`
  - RLS policies based on roles (`admin`, `author`)
- `library_items_schema.sql` creates:
  - `library_items`
  - unique key `(user_id, media_type, tmdb_id)`
  - `updated_at` trigger
  - per-user RLS policies for CRUD

## Author Mode

Frontend author mode is enabled only for users that have `author` or `admin` role in `app_user_roles`.

## Quality Gates

Current CI-style checks:

- `npm run build`
- `npm audit --omit=dev`
- `npm run lint`
- `npm run test`
- `npm run typecheck`
