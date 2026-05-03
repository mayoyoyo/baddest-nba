# Supabase bootstrap

This app is being migrated from Cloudflare to Vercel + Supabase.

Use this checklist when the code-side migration is ready to connect to a real Supabase project.

## 1. Create the Supabase project

1. Go to the [Supabase dashboard](https://supabase.com/dashboard).
2. Create a new project on the Free plan.
3. Save:
   - project URL
   - database password
   - anon key
   - service role key

## 2. Get the serverless database connection string

1. Open the project.
2. Go to `Connect`.
3. Copy the `Transaction pooler` connection string.
4. Replace the password placeholder with your real database password.

This is the connection string intended for serverless workloads.

## 3. Create the image storage bucket

1. Open `Storage`.
2. Create a bucket named `images`.
3. Keep the bucket private.

The app proxies image bytes through authenticated API routes, so the bucket should not be made public.

## 4. Apply SQL migrations

Run the SQL in:

- [20260417_0001_initial_schema.sql](/Users/warrenkang/Documents/Codex/2026-04-17-make-me-a-new-project-and/baddest/supabase/migrations/20260417_0001_initial_schema.sql)

If the repo later gains additional migration files, apply them in order.

## 5. Configure Vercel environment variables

Set these in the Vercel project:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TURNSTILE_BYPASS`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

See [.env.example](/Users/warrenkang/Documents/Codex/2026-04-17-make-me-a-new-project-and/baddest/.env.example) for the expected shape.

## 6. Promote the first admin

Once the migrated app is live and you create your first account through the UI, promote that user to admin with SQL similar to:

```sql
update users
set role = 'admin'
where username = 'your-username';
```

## 7. Upload the shared image pool

After admin promotion:

1. sign in
2. open `/admin/upload`
3. upload the shared image pool

The upload flow preserves filename-derived labels so the leaderboard stays readable.
