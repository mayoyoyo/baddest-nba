# Vercel and Supabase deploy

This project is being migrated from Cloudflare to Vercel + Supabase.

At the current checkpoint:

- the app has a Vercel API entrypoint
- the server can resolve its database from either Cloudflare D1 or Postgres
- the image layer can resolve storage from either Cloudflare R2 or Supabase Storage

The remaining deployment work is mainly account setup and environment wiring.

## 1. Create the Supabase project

1. Create a Supabase project on the Free plan.
2. Create a private storage bucket named `images`.
3. Apply the SQL in:
   - [20260417_0001_initial_schema.sql](/Users/warrenkang/Documents/Codex/2026-04-17-make-me-a-new-project-and/baddest/supabase/migrations/20260417_0001_initial_schema.sql)

Keep these values:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- transaction pooler `DATABASE_URL`

## 2. Import the repo into Vercel

1. Push this repo to GitHub.
2. Log in to Vercel.
3. Import the GitHub repository.

## 3. Set environment variables in Vercel

Set:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TURNSTILE_BYPASS`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

For the first hosted version, `TURNSTILE_BYPASS=true` is acceptable for a very small trusted group because the client still uses the local-bypass token path.

## 4. Deploy

After logging into Vercel locally, deploy with:

```bash
npx vercel
```

For production:

```bash
npx vercel --prod
```

## 5. Bootstrap the first admin

1. Sign up through the deployed app.
2. Promote that account to admin with SQL:

```sql
update users
set role = 'admin'
where username = 'your-username';
```

## 6. Upload the shared image pool

Once the account is admin:

1. sign in
2. open `/admin/upload`
3. upload the image set

## Notes

- The current automated integration harness is still Cloudflare-backed during the migration. This is intentional while the compatibility bridge remains in place.
- Final cleanup should remove:
  - `wrangler.jsonc`
  - Cloudflare-specific test harness config
  - Cloudflare-only deploy docs
