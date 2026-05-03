# Vercel and Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the existing face-ranking app from Cloudflare Pages/D1/R2 to Vercel plus Supabase while preserving the current product behavior and keeping the deployment path free-tier friendly.

**Architecture:** Keep the React SPA and Hono API structure, replace the Cloudflare adapter with a Vercel adapter, replace D1 repositories with Postgres-backed repositories against Supabase, and replace R2 image storage with Supabase Storage. Keep ranking, pairing, aggregation, and custom username-plus-PIN auth logic in app code.

**Tech Stack:** TypeScript, React, React Router, Vite, Hono, Vercel Functions, Supabase Postgres, Supabase Storage, Postgres SQL, Vitest, React Testing Library, Playwright

---

## Scope Check

This plan covers one coherent subsystem: the infrastructure and backend migration needed to run the existing app on Vercel and Supabase. It does not redesign ranking behavior, auth UX, or frontend routes.

## Proposed File Structure

### Root config

- Modify: `package.json`
  - Replace Cloudflare scripts and add Vercel-compatible scripts/dependencies.
- Create: `vercel.json`
  - Vercel routing/runtime config if needed.
- Modify: `tsconfig.json`
  - Ensure server code typechecks in the Vercel/Node runtime.
- Modify: `vite.config.ts`
  - Keep SPA build output aligned with Vercel static hosting.
- Modify: `.gitignore`
  - Include any new local env or generated files as needed.
- Replace: `.dev.vars.example` with `.env.example`
  - Document Vercel/Supabase env vars.
- Delete: `wrangler.jsonc`
  - Remove Cloudflare deployment binding config once migration is complete.

### API runtime

- Delete: `src/server/worker.ts`
  - Cloudflare worker entrypoint no longer needed.
- Create: `api/[[...route]].ts`
  - Vercel-compatible Hono entrypoint.
- Modify: `src/server/app.ts`
  - Keep API mounting, but remove Cloudflare-specific assumptions from app wiring.
- Modify: `src/server/types.ts`
  - Replace Cloudflare bindings with explicit env/config and app context types.

### Environment and platform helpers

- Create: `src/server/lib/env.ts`
  - Parse and validate required environment variables.
- Replace: `src/server/lib/db.ts`
  - Add Postgres query and transaction helpers.
- Modify: `src/server/lib/storage.ts`
  - Replace R2 helpers with Supabase Storage helpers.
- Modify: `src/server/lib/auth.ts`
  - Remove Cloudflare env typing assumptions and keep cookie/session lookup behavior.
- Modify: `src/server/lib/turnstile.ts`
  - Use standard `fetch` and env values in the Vercel runtime.

### Repositories and services

- Modify: `src/server/repositories/usersRepo.ts`
- Modify: `src/server/repositories/imagesRepo.ts`
- Modify: `src/server/repositories/votesRepo.ts`
- Modify: `src/server/repositories/leaderboardsRepo.ts`
  - Port D1 SQL and result handling to Postgres.
- Modify: `src/server/services/authService.ts`
- Modify: `src/server/services/voteService.ts`
- Modify: `src/server/services/leaderboardService.ts`
- Modify: `src/server/services/uploadService.ts`
  - Preserve behavior while changing storage/database plumbing.

### Database and storage setup

- Create: `supabase/migrations/20260417_0001_initial_schema.sql`
  - Postgres schema for the current app model.
- Create: `supabase/migrations/20260417_0002_storage_setup.sql`
  - Bucket metadata and policies guidance if represented in SQL, otherwise docs only.
- Create: `docs/operations/vercel-supabase-deploy.md`
  - End-to-end setup and deploy instructions.
- Create: `docs/operations/supabase-bootstrap.md`
  - How to create the project, bucket, env vars, and first admin.

### Tests

- Modify: `tests/unit/smoke.test.ts`
  - Keep app health coverage in the new runtime.
- Modify: `tests/unit/*.test.ts`
  - Keep domain tests unchanged unless imports move.
- Replace: `vitest.integration.config.ts`
  - Remove Cloudflare worker pool integration.
- Replace: `tests/integration/*.test.ts`
  - Convert to Node/Vercel-compatible app tests with mocked or test Postgres/storage dependencies where needed.

## Implementation Notes

- Keep repository function signatures stable where possible to reduce service churn.
- Use a Postgres client compatible with serverless pooling. For Supabase transaction pooler mode, prepared statements must remain disabled.
- Keep image access private through the existing authenticated image proxy route.
- Do not migrate to Supabase Auth. Preserve the app’s username plus 4-digit PIN flow.
- Keep the leaderboard API shape stable so the frontend mostly survives the migration unchanged.

## Tasks

### Task 1: Swap project runtime from Cloudflare to Vercel

**Files:**
- Modify: `package.json`
- Create: `api/[[...route]].ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/types.ts`
- Delete: `src/server/worker.ts`
- Create: `.env.example`
- Test: `tests/unit/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke/runtime test**

```ts
import { describe, expect, it } from 'vitest'
import app from '../../src/server/app'

describe('server smoke', () => {
  it('responds from the health endpoint', async () => {
    const response = await app.request('/api/health')
    expect(response.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run the smoke test to verify runtime breakage is visible**

Run: `npm run test:unit -- tests/unit/smoke.test.ts`
Expected: PASS before edits, then use follow-up checks to catch adapter/config regressions.

- [ ] **Step 3: Replace Cloudflare scripts and add Vercel-compatible ones**

Update `package.json` scripts to include:

```json
{
  "dev": "vercel dev",
  "build": "vite build",
  "deploy": "vercel --prod",
  "typecheck": "tsc --noEmit"
}
```

Add the runtime dependency needed for Vercel Hono support.

- [ ] **Step 4: Add the Vercel entrypoint**

Create `api/[[...route]].ts` with a default export from the Hono app using the Vercel adapter.

- [ ] **Step 5: Remove Cloudflare-specific server typing**

Refactor `src/server/types.ts` so server code no longer depends on `Cloudflare.Env`.

- [ ] **Step 6: Run targeted verification**

Run: `npm run test:unit -- tests/unit/smoke.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json api/[[...route]].ts src/server/app.ts src/server/types.ts .env.example src/server/worker.ts tests/unit/smoke.test.ts
git commit -m "chore: move runtime baseline to vercel"
```

### Task 2: Add Supabase environment, Postgres client, and schema foundation

**Files:**
- Create: `src/server/lib/env.ts`
- Replace: `src/server/lib/db.ts`
- Create: `supabase/migrations/20260417_0001_initial_schema.sql`
- Create: `docs/operations/supabase-bootstrap.md`
- Test: `tests/unit/smoke.test.ts`

- [ ] **Step 1: Write a failing env validation test**

```ts
import { describe, expect, it } from 'vitest'
import { readServerEnv } from '../../src/server/lib/env'

describe('readServerEnv', () => {
  it('throws when DATABASE_URL is missing', () => {
    expect(() => readServerEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails correctly**

Run: `npm run test:unit -- tests/unit/env.test.ts`
Expected: FAIL with module-not-found for `env.ts`.

- [ ] **Step 3: Implement env parsing and Postgres client setup**

Add `readServerEnv()` and a db helper using the Supabase transaction pooler connection string with prepared statements disabled.

- [ ] **Step 4: Port the D1 schema to Postgres SQL**

Create `supabase/migrations/20260417_0001_initial_schema.sql` with the current table set and indexes translated to Postgres syntax.

- [ ] **Step 5: Verify**

Run: `npm run test:unit -- tests/unit/env.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/lib/env.ts src/server/lib/db.ts supabase/migrations/20260417_0001_initial_schema.sql docs/operations/supabase-bootstrap.md tests/unit/env.test.ts
git commit -m "feat: add supabase env and postgres schema foundation"
```

### Task 3: Port repository modules from D1 to Postgres

**Files:**
- Modify: `src/server/repositories/usersRepo.ts`
- Modify: `src/server/repositories/imagesRepo.ts`
- Modify: `src/server/repositories/votesRepo.ts`
- Modify: `src/server/repositories/leaderboardsRepo.ts`
- Modify: `src/server/lib/db.ts`
- Test: `tests/integration/auth.test.ts`
- Test: `tests/integration/vote.test.ts`
- Test: `tests/integration/leaderboards.test.ts`

- [ ] **Step 1: Write or update a failing auth integration test that exercises repo reads/writes**

Use the existing signup/login flow test, but run it in the new Node-compatible app harness.

- [ ] **Step 2: Run the auth integration test to verify D1-specific failures**

Run: `npm run test:integration -- tests/integration/auth.test.ts`
Expected: FAIL because repository helpers still expect D1 APIs.

- [ ] **Step 3: Replace D1 prepared statements with Postgres query helpers**

Port one repository at a time:

- `usersRepo.ts`
- `imagesRepo.ts`
- `votesRepo.ts`
- `leaderboardsRepo.ts`

Preserve function signatures where possible.

- [ ] **Step 4: Add transaction support for multi-write flows**

Ensure `db.ts` exposes a transaction helper the vote service can use.

- [ ] **Step 5: Run integration coverage**

Run: `npm run test:integration -- tests/integration/auth.test.ts tests/integration/vote.test.ts tests/integration/leaderboards.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/usersRepo.ts src/server/repositories/imagesRepo.ts src/server/repositories/votesRepo.ts src/server/repositories/leaderboardsRepo.ts src/server/lib/db.ts tests/integration/auth.test.ts tests/integration/vote.test.ts tests/integration/leaderboards.test.ts
git commit -m "feat: port repositories to postgres"
```

### Task 4: Port image storage from R2 to Supabase Storage

**Files:**
- Modify: `src/server/lib/storage.ts`
- Modify: `src/server/services/uploadService.ts`
- Modify: `src/server/routes/images.ts`
- Modify: `src/server/routes/admin.ts`
- Modify: `tests/integration/upload.test.ts`

- [ ] **Step 1: Write a failing upload integration test against the new storage abstraction**

Keep the current expectations:

- admin can upload
- filename-derived image id is returned
- authenticated image fetch works

- [ ] **Step 2: Run the upload test to verify the storage-layer failure**

Run: `npm run test:integration -- tests/integration/upload.test.ts`
Expected: FAIL because storage helpers still expect `R2Bucket`.

- [ ] **Step 3: Implement Supabase Storage helpers**

Add helpers to:

- upload an object
- download an object
- delete uploaded objects on partial failure

- [ ] **Step 4: Update upload/image services to use the new helpers**

Preserve:

- private access
- display/original split
- filename-derived IDs with dedupe

- [ ] **Step 5: Re-run upload coverage**

Run: `npm run test:integration -- tests/integration/upload.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/lib/storage.ts src/server/services/uploadService.ts src/server/routes/images.ts src/server/routes/admin.ts tests/integration/upload.test.ts
git commit -m "feat: move image storage to supabase"
```

### Task 5: Update auth, vote, and service wiring for the new platform

**Files:**
- Modify: `src/server/lib/auth.ts`
- Modify: `src/server/lib/turnstile.ts`
- Modify: `src/server/lib/rateLimit.ts`
- Modify: `src/server/services/authService.ts`
- Modify: `src/server/services/voteService.ts`
- Modify: `src/server/services/leaderboardService.ts`
- Modify: `src/server/routes/auth.ts`
- Modify: `src/server/routes/vote.ts`
- Modify: `src/server/routes/leaderboards.ts`
- Test: `tests/integration/skip.test.ts`

- [ ] **Step 1: Write or update a failing skip/vote integration test**

Focus on:

- valid session lookup
- skip updates recent-pair cache
- vote updates personal and shared ranking state atomically

- [ ] **Step 2: Run the skip/vote test to verify service-level breakage**

Run: `npm run test:integration -- tests/integration/skip.test.ts`
Expected: FAIL because services still assume Cloudflare env/bindings.

- [ ] **Step 3: Remove Cloudflare assumptions from service wiring**

Refactor auth, turnstile, and rate limit helpers to use explicit env/config and Postgres-backed persistence.

- [ ] **Step 4: Verify route behavior**

Run: `npm run test:integration -- tests/integration/skip.test.ts tests/integration/vote.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/auth.ts src/server/lib/turnstile.ts src/server/lib/rateLimit.ts src/server/services/authService.ts src/server/services/voteService.ts src/server/services/leaderboardService.ts src/server/routes/auth.ts src/server/routes/vote.ts src/server/routes/leaderboards.ts tests/integration/skip.test.ts
git commit -m "feat: rewire auth and vote flows for vercel and supabase"
```

### Task 6: Replace Cloudflare integration harness and local dev workflow

**Files:**
- Modify: `vitest.integration.config.ts`
- Modify: `tests/integration/apply-migrations.ts`
- Delete: `tests/integration/env.d.ts`
- Modify: `tests/e2e/vote-flow.spec.ts`
- Modify: `package.json`
- Create: `docs/operations/vercel-supabase-deploy.md`

- [ ] **Step 1: Write a failing end-to-end smoke step for the new local dev path**

Document the expected local start command and make the E2E server launcher reflect it.

- [ ] **Step 2: Replace Cloudflare-specific test harness setup**

Remove `@cloudflare/vitest-pool-workers` usage and move integration setup to a Node/Vercel-compatible path.

- [ ] **Step 3: Update deploy and bootstrap docs**

Write:

- Supabase project setup
- storage bucket creation
- env variable setup in Vercel
- repo import and deploy
- first-admin promotion SQL

- [ ] **Step 4: Run verification**

Run: `npm run test:unit`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add vitest.integration.config.ts tests/integration/apply-migrations.ts tests/integration/env.d.ts tests/e2e/vote-flow.spec.ts package.json docs/operations/vercel-supabase-deploy.md
git commit -m "chore: replace cloudflare test and deploy workflow"
```

### Task 7: Final migration verification and cleanup

**Files:**
- Modify: `package.json`
- Delete: `wrangler.jsonc`
- Delete: Cloudflare-only docs or replace their references where appropriate
- Verify: existing frontend files still use stable API contracts

- [ ] **Step 1: Remove obsolete Cloudflare config only after replacement is verified**

Delete:

- `wrangler.jsonc`
- remaining Cloudflare-only deploy instructions no longer relevant

- [ ] **Step 2: Run full verification**

Run: `npm run test:unit`
Expected: PASS

Run: `npm run test:integration`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Start the local dev server and sanity-check key routes**

Run: `npm run dev`
Expected: local Vercel-compatible dev server starts

Check:

- `/signup`
- `/vote`
- `/leaderboard`
- `/users/:username`

- [ ] **Step 4: Commit**

```bash
git add package.json wrangler.jsonc docs/operations/vercel-supabase-deploy.md docs/operations/supabase-bootstrap.md
git commit -m "chore: finalize vercel and supabase migration"
```
