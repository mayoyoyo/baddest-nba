# Deploy

This project is set up for Cloudflare Pages with Pages Functions, D1, and R2.

## 1. Create the Pages project

```bash
npx wrangler pages project create
```

Choose a project name. Cloudflare will serve production at `<project-name>.pages.dev`.

## 2. Create the backing resources

Create the D1 database:

```bash
npx wrangler d1 create <DB_NAME>
```

Create the R2 bucket:

```bash
npx wrangler r2 bucket create <BUCKET_NAME>
```

Save the D1 `database_id` from the create command output.

## 3. Bind resources in `wrangler.jsonc`

Update the D1 binding:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "<DB_NAME>",
    "database_id": "<DATABASE_ID>"
  }
]
```

Update the R2 binding:

```jsonc
"r2_buckets": [
  {
    "binding": "IMAGES_BUCKET",
    "bucket_name": "<BUCKET_NAME>"
  }
]
```

Keep `TURNSTILE_BYPASS` set to `false` in production and set a real `TURNSTILE_SITE_KEY` for your Pages hostname.

## 4. Set the Turnstile secret

```bash
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name <PROJECT_NAME>
```

Paste your Turnstile secret when prompted.

## 5. Build and deploy

```bash
npm install
npm run build
npm run deploy
```

`npm run deploy` runs:

```bash
wrangler pages deploy dist
```

If this is your first deploy, Wrangler will link the local project to the Pages project you created earlier.

## 6. Apply migrations remotely

```bash
npx wrangler d1 migrations apply <DB_NAME> --remote
```

## 7. Bootstrap the first admin

Follow [admin-bootstrap.md](/Users/warrenkang/Documents/Codex/2026-04-17-make-me-a-new-project-and/baddest/docs/operations/admin-bootstrap.md).

## Local verification

For a production-like local server that includes static assets plus Pages Functions:

```bash
npm run e2e:server
```

That command builds the app and starts `wrangler pages dev` on `http://127.0.0.1:8788`.
