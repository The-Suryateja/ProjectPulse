# ProjectPulse

ProjectPulse ingests multiple project documents (PDF, DOCX, PPTX, TXT, MD),
extracts structured data from each one with Gemini, and aggregates them into
a single cross-document report — merged risks, a decisions timeline,
unresolved questions, and detected conflicts between documents.

## Stack

- React + TypeScript + Vite, Tailwind CSS
- Supabase (Postgres + Auth + Storage + Edge Functions)
- Google Gemini for document extraction and report aggregation

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

You can find both values in your Supabase project under
**Project Settings → API**.

### 3. Set up the database

Run the SQL files in `supabase/migrations/` against your Supabase project,
in order, via the Supabase SQL Editor or the Supabase CLI:

```bash
supabase db push
```

This creates the `projects`, `documents`, and `reports` tables, enables
Row Level Security, and sets up ownership-based access policies (every row
is scoped to the signed-in user who created it).

### 4. Enable email authentication

In the Supabase dashboard, go to **Authentication → Providers** and make
sure **Email** is enabled. The app requires a signed-in session — there is
no anonymous/guest access.

### 5. Deploy the edge functions

The extraction and aggregation logic runs as two Supabase Edge Functions:

```bash
supabase functions deploy extract-document
supabase functions deploy aggregate-report
```

Both functions need a `GEMINI_API_KEY` secret set in your Supabase project
(**Edge Functions → Secrets**).

### 6. Run the app

```bash
npm run dev
```

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript compiler in check-only mode |

## Project structure

```
src/
  lib/         Supabase client, auth context, edge function wrappers
  pages/       Dashboard, Project, Report, Login
  types/       Shared TypeScript types
supabase/
  migrations/  Database schema and RLS policies
  functions/   extract-document, aggregate-report edge functions
```
