# Admin bootstrap

This app keeps account data in D1. New accounts are created as regular users, so the first admin promotion is a one-time D1 update after you sign up through the UI.

## 1. Create your account

1. Start the app locally with `npm run e2e:server` or deploy it first.
2. Open `/signup`.
3. Create the username and 4-digit PIN you want to keep as the admin account.

## 2. Promote that account to admin

Run this against the deployed D1 database:

```bash
npx wrangler d1 execute <DB_NAME> --remote --command \
"UPDATE users SET role = 'admin' WHERE username = 'your-username';"
```

Replace:

- `<DB_NAME>` with your D1 database name.
- `your-username` with the account you already created through the app.

## 3. Verify admin access

1. Sign in again if you already had a session open.
2. Open `/vote`.
3. Confirm the `Admin upload` link appears in the header.
4. Open `/admin/upload` and upload the shared image pool.

## Local-only promotion

For local development, use the same command with `--local` instead of `--remote`:

```bash
npx wrangler d1 execute <DB_NAME> --local --command \
"UPDATE users SET role = 'admin' WHERE username = 'your-username';"
```
