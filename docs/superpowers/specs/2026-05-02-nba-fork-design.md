# NBA Fork — Design

A standalone fork of `baddest` that ranks NBA player headshots on looks alone, hosted as a single container on Fly.io against a separate Supabase. Same engine (ELO ratings, blind 1v1 voting, per-user + global leaderboards, username/PIN auth), different roster, different deployment target.

## Goals

- Reuse the **engine** (rating, pairing, confidence, shared aggregation, vote/leaderboard services, repositories, auth) verbatim from `baddest` — that's the real value of the fork.
- **Rebuild the frontend** from scratch as mobile-first with bottom-tab nav and shadcn-style components. The original UI was desktop-first and not the part worth copying.
- Keep voting **blind** (photo only) so player ability/identity doesn't drive the vote. Names appear only on the leaderboard.
- Zero image-hosting cost: hotlink directly from `cdn.nba.com`.
- Roster updates are a script away — no manual upload UI.
- One small, objective engine improvement: **dynamic K-factor** (chess-style decay 48→32→24→16 by match count). Stabilizes established ratings, lets new ones converge fast.

## Non-goals

- No player-stat overlays, no team filters, no comparisons across positions. Just one engine, one global leaderboard, optional per-user leaderboard (same as today).
- No ingestion UI. Roster comes from `players.json`; admins re-seed via script.
- No multi-tenant code-sharing with the original `baddest`. This is a separate repo with a separate deployment lifecycle.

## Repo & deployment layout

- Local working directory: `/Users/hansonkang/Documents/GitHub/baddest-nba`.
- **GitHub repo**: `mayoyoyo/baddest-nba`, **public**, created via `gh repo create mayoyoyo/baddest-nba --public --source=. --remote=origin --push` from the new directory after the initial copy + commit. Fresh git history (no `.git` carried over from the source repo).
- **CI/CD**: GitHub Actions workflow at `.github/workflows/fly-deploy.yml` runs on push to `main`. Uses `superfly/flyctl-actions/setup-flyctl` + `flyctl deploy --remote-only`. `FLY_API_TOKEN` is a deploy-scoped token (`flyctl tokens create deploy -x 999999h`) stored as a GitHub Actions secret on the repo. No PR previews for v1.
- **Fly.io app** named `baddest-nba` (or your preferred slug) — a single Node container that serves both the Hono API and the built React SPA. Region: `iad` (close to your Supabase, which is `aws-1-us-east-1`).
- Supabase env vars (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_*`) set via `fly secrets set`, not committed.
- The Cloudflare/D1/R2 **and** Vercel paths in the original repo are dead code for our deployment. We delete `wrangler.jsonc`, the `functions/` adapter, the R2 storage branch in `lib/storage.ts`, the SQLite migration in `migrations/`, the `api/` directory (Vercel serverless wrappers), `vercel.json`, and the `vercel` dev dependency. Less code to maintain.

## Architecture (deltas vs. original)

Everything below is a delta against current `baddest/main`. Anything not mentioned stays the same.

### -1. Frontend: rebuild mobile-first with Tailwind + shadcn-style components

The original `src/client/` is desktop-shaped and tied to the upload/admin flow we're deleting. Rebuilding is faster and cleaner than retrofitting.

- Tailwind CSS + shadcn/ui (set up via `npx shadcn@latest init`). shadcn generates components into `src/client/components/ui/` so we own the source — no runtime dep.
- Required shadcn primitives: `button`, `card`, `tabs`, `avatar`, `input`, `label`, `dialog`, `skeleton`, `separator`. Pulled in as needed.
- Layout: full-bleed mobile, max-width `md` on tablet+. Persistent **bottom tab bar** on mobile (Vote / Leaderboard / Me), top nav on `md:` and up.
- Pages:
  - **Vote** (`/`): two stacked headshot cards on mobile (tap to pick), side-by-side on `md:`. Faces only — no name, no team. Skip button. Uses cdn.nba.com URLs.
  - **Leaderboard** (`/leaderboard`): infinite list, `Avatar` (260x190 NBA thumbnail) + name + team + score + rank. Tap a row → modal with bigger photo + score history (just the row data for now, history comes later).
  - **Me** (`/me`): vote count, your top 10 personal ranking, account actions (logout, delete).
  - **Sign in / Sign up** (`/login`, `/signup`): card-centered form, same auth (username + PIN).
- Theme: dark mode default (works better with NBA headshots which are shot on light/neutral backgrounds), red/black accent reads "league".
- API client (`src/client/lib/api.ts`): tiny fetch wrapper, returns typed responses. Mostly the same shape as today's calls minus image upload/admin.
- The old `src/client/` is **deleted entirely** as part of the punch list. We don't try to migrate components.

### 0. Server runtime: Node + Hono in a container

The original is a Hono app shaped for serverless (Vercel function adapter, also Cloudflare Worker). For Fly we run it as a normal long-lived Node process and have it serve the SPA too — one container, one port.

- New entry `src/server/node.ts`:
  - Imports `serve` from `@hono/node-server` and `serveStatic` from `@hono/node-server/serve-static`.
  - Mounts the existing `app` (`src/server/app.ts`) under `/api` (already its own prefix) and adds a static handler for `dist/` plus a SPA fallback that serves `dist/index.html` for any non-`/api` non-`/assets` path. (The current `vercel.json` rewrite that does this becomes server code instead.)
  - Listens on `process.env.PORT ?? 8080`.
- New deps: `@hono/node-server`. Drop `vercel`, `@cloudflare/vitest-pool-workers`, `wrangler`, `worker-configuration.d.ts`.
- `src/server/lib/runtime.ts` and `src/server/types.ts` lose their Cloudflare bindings shape; `AppBindings` becomes a small interface holding only the env vars we read at runtime. `getDb` reads `DATABASE_URL` from `process.env` (this is already the path used in the Vercel build today).
- `Dockerfile` (multi-stage, at repo root):
  - Stage `build`: `node:22-alpine`, `npm ci`, `npm run build` (Vite → `dist/`), `npm run build:server` (new tsc step that compiles `src/server` to `dist-server/`).
  - Stage `runtime`: `node:22-alpine`, copy `dist/`, `dist-server/`, `node_modules` (production-only), `package.json`. CMD `node dist-server/server/node.js`.
- `fly.toml`:
  - `app = "baddest-nba"`, `primary_region = "iad"`.
  - `[http_service]` with `internal_port = 8080`, `force_https = true`, `auto_stop_machines = true`, `auto_start_machines = true`, `min_machines_running = 0` (free-tier friendly; cold starts are fine for a hobby app).
  - `[[http_service.checks]]` hitting `/api/health` (already exists).
  - One `[mounts]` is **not** needed — no persistent volume; all state lives in Supabase.
- `package.json` scripts:
  - `build` → `vite build && tsc -p tsconfig.server.json` (new tsconfig that emits `dist-server/`)
  - `start` → `node dist-server/server/node.js`
  - `dev` stays the same (Vite + the existing `dev:local` flow that already speaks Node).
  - Drop `cf:typegen`, `dev:vercel`, `dev:pages`, `deploy`, `deploy:vercel`.

### 1. Data source: NBA roster, not user uploads

- New file at the repo root: `data/players.json` — copied from `nba-headshots/players.json`, then filtered to remove every entry in `nba-headshots/players.faceless.json` (8 players today). Stays in version control; refreshed manually by re-running the upstream `refresh_players.py` and the filter step.
- We do **not** import or run the `nba-headshots` Python tooling. We just copy the resulting JSON.

### 2. Image hosting: hotlink from `cdn.nba.com`

- URL pattern: `https://cdn.nba.com/headshots/nba/latest/{size}/{personId}.png`
  - Voting card (large): `1040x760`
  - Leaderboard thumbnail: `260x190`
- Frontend constructs URLs directly from `imageId` (= NBA personId, stored as text). No `/api/image` indirection.
- Delete `/api/image` and `/api/images/:imageId` routes.
- Delete `src/server/lib/storage.ts`, `src/server/services/uploadService.ts`, the upload helper imports, and the R2 type from `worker-configuration.d.ts`.
- Delete `src/client/routes/AdminUploadPage.*` and its route registration.
- Why no proxy/redirect: the existing `/api/image` requires auth, but cdn.nba.com is a public CDN — proxying buys nothing and adds latency. The frontend hits the CDN directly.

### 3. Schema changes

Single new migration `0002_nba_players.sql`:

```sql
-- relax storage columns: we no longer mirror images
alter table images alter column r2_key_original drop not null;
alter table images alter column r2_key_display drop not null;

-- player metadata, keyed on personId (= images.id)
create table players (
  id text primary key references images(id) on delete cascade,
  first text not null,
  last text not null,
  team text,
  team_full text,
  jersey text,
  pos text
);
create index idx_players_last_first on players(last, first);
```

Notes:
- `images.id` holds the NBA personId as text (e.g. `"1630173"`). Existing engine code treats `image_id` as opaque, so this is invisible to the engine.
- `r2_key_*` columns are kept (nullable now) to avoid touching the `imagesRepo` write path; they stay NULL for NBA rows.
- We do **not** rename `images` to `players` even though "players" is the better name here. The cost (touching every repo/service/index/test) outweighs the clarity gain. The new `players` table holds the metadata; `images` remains the canonical "thing being voted on" table.

### 4. Seed script

New file: `scripts/seed-nba-players.ts`. Run with `tsx --env-file=.env.local`.

Behavior:
- Reads `data/players.json`.
- For each player, upserts a row into `images` (status=active, r2 keys NULL, sort_order = stable hash of personId so order is deterministic but not alphabetical) and into `players`.
- Idempotent: re-runs are safe. Adds new rookies, updates trades (team change), removes players who dropped from the roster (delete cascades to `players`, `personal_image_state`, `shared_image_state`, `vote_events` — same cascade behavior as admin delete today).
- Single transaction per run.

Dev workflow: clone → set `.env.local` → `npm install` → run Supabase migrations → `npx tsx --env-file=.env.local scripts/seed-nba-players.ts`.

### 4b. Engine improvement: dynamic K-factor

In `src/server/domain/rating.ts`, replace the constant `DEFAULT_K = 32` with a function over an image's `comparisons` count:

```ts
export function dynamicK(comparisons: number): number {
  if (comparisons <= 5) return 48;
  if (comparisons <= 15) return 32;
  if (comparisons <= 30) return 24;
  return 16;
}
```

`applyEloVote` takes `{ winner, loser, winnerComparisons, loserComparisons }`. Each side decays independently — a brand-new player paired against a "Locked In" star uses K=48 for himself but K=16 for the star. Callers in `voteService.ts` thread the comparison counts through. Existing `k?: number` override stays for tests.

### 4c. Switch runtime DB to direct Postgres

Today's runtime path goes Hono → Supabase Data API (REST) → Postgres, via a 400-line SQL-string→REST adapter in `src/server/lib/db.ts`. That's a Vercel-Edge workaround that has no place in a long-lived Node process.

- `getRuntimeDb` switches to `createPostgresDb(env.databaseUrl)` (already exported, uses `pg.Pool`).
- Delete `DataApiAdapter`, `createDataApiDb`, `createSupabaseDataApiAdapter`, and every `if (normalized === ...)` branch in `db.ts`. The file shrinks to ~150 lines (pg pool + transaction client + the unchanged D1 helper, which we also delete since Cloudflare is gone).
- Drop runtime dep `@supabase/supabase-js` (only needed for storage + Data API; both deleted).
- This unblocks proper SQL JOINs for the leaderboard.

### 5. Leaderboard returns names

- `getSharedLeaderboard` and `getUserLeaderboard` in `leaderboardService.ts` LEFT JOIN `players` on `image_id` and include `{ first, last, team, jersey, pos }` in each row.
- `LeaderboardTable` shows `"{first} {last}" — {team}` next to the rank/score, plus the small headshot pulled from cdn.nba.com.
- The blind voting card (`ImagePair`) does **not** consume the join. It only renders the headshot. Names stay hidden during voting by construction, not by toggle.

### 6. Auth & admin surface

- Keep username + PIN auth, sessions, signups-open default, Turnstile gating. No change.
- The admin route file is deleted (above), but the `role` column on `users` and the `requireAdmin` middleware stay. Cheap to keep, useful if we add hide-a-player tooling later.

### 7. Branding / copy

- App title: "Baddest in the L" (parallels original; "L" = the league). Configurable in one place — `src/client/components/AppShell.tsx` + `index.html` `<title>`.
- Vote prompt: "Who's the baddest?" (unchanged in spirit; the photos make it clear the answer is looks-only).
- README updated to describe the fork, point at the new Supabase, and document the seed script.

## Data flow

```
nba-headshots/players.json  →  data/players.json (copy + faceless filter)
                                       │
                              scripts/seed-nba-players.ts
                                       │
                                       ▼
                               Supabase Postgres
                              (images + players)
                                       │
                                       ▼
            Hono API ──► /pair, /vote, /leaderboard/* (engine unchanged)
                                       │
                                       ▼
                               React frontend
                              ──► constructs cdn.nba.com URL from imageId
                              ──► browser loads headshot directly from NBA CDN
```

## Components touched (concrete punch list)

Delete:
- `wrangler.jsonc`, `functions/`, `worker-configuration.d.ts`, `migrations/` (Cloudflare/D1)
- `vercel.json`, `api/` directory (Vercel)
- `src/server/lib/storage.ts`, `src/server/services/uploadService.ts`
- `src/server/routes/admin.ts`, `src/server/routes/images.ts`
- `src/client/routes/AdminUploadPage.*` and its router entry
- R2 references in `src/server/types.ts`, `src/server/lib/runtime.ts`
- `scripts/local-preview-server.ts` (Cloudflare Pages preview)
- Dev deps: `vercel`, `wrangler`, `@cloudflare/vitest-pool-workers`

Add:
- `Dockerfile`, `.dockerignore`, `fly.toml`
- `src/server/node.ts` (Node entry — boots `@hono/node-server`, mounts `app`, serves `dist/` static + SPA fallback)
- `tsconfig.server.json` (compiles `src/server/**` and `src/lib/**` to `dist-server/`)
- `data/players.json`
- `scripts/seed-nba-players.ts`
- `supabase/migrations/20260502_0002_nba_players.sql`
- `src/server/repositories/playersRepo.ts` (single function: `listPlayersByImageIds`)
- Runtime dep: `@hono/node-server`

Modify:
- `package.json` scripts → `build`, `start`, `dev` only (drop the cf/vercel ones)
- `src/server/types.ts`, `src/server/lib/runtime.ts` → drop Cloudflare bindings, simplify `AppBindings` to env-var passthrough
- `src/server/services/leaderboardService.ts` → join `players`
- `src/client/components/LeaderboardTable.tsx` → render name + team + cdn.nba.com thumbnail
- `src/client/components/ImagePair.tsx` → load `https://cdn.nba.com/headshots/nba/latest/1040x760/{imageId}.png` directly
- `src/client/components/AppShell.tsx`, `index.html`, `README.md` → branding

## Error handling

- **Missing headshot at NBA CDN**: very rare for active players, but if a personId returns 404, the browser shows a broken image. The voting card listens for `<img onError>` and reports the imageId to a thin `/api/report-missing` endpoint; the engine then marks that image `status='hidden'` so it stops appearing in pairs. (Same `status` column already exists.)
- **Seed script run against an unmigrated DB**: fail fast with the missing-table error from Postgres; no recovery logic.
- **CDN blocks hotlinking** (theoretical, never happened): swap to mirror mode by adding back `storage.ts` and updating the seed script to also upload bytes. Out of scope for v1.

## Testing

- Existing unit/integration tests for the engine continue to pass unchanged (the engine doesn't know about NBA).
- New test: `seed-nba-players.test.ts` — runs the seed against a fresh DB, asserts row counts match the filtered roster, asserts a re-run is idempotent.
- New test: `leaderboardService.test.ts` extended to cover name/team enrichment.
- E2E: skip for v1; the existing Playwright suite hits the upload UI which we're deleting. We'll re-stub a minimal smoke test (login → vote → see leaderboard) but not block the v1 cut on it.

## Rollout

1. Copy `baddest/` to `baddest-nba/`, delete its `.git`, `git init`, initial commit.
2. Apply the punch list above; commit in logical chunks.
3. `gh repo create mayoyoyo/baddest-nba --private --source=. --remote=origin --push`.
4. Apply both Supabase migrations against the new project (`psql "$DATABASE_URL" -f supabase/migrations/<file>` for each).
5. `npx tsx --env-file=.env.local scripts/seed-nba-players.ts`.
6. `fly launch --no-deploy --copy-config --name baddest-nba --region iad` (uses the `fly.toml` we wrote; `--no-deploy` so we can set secrets first).
7. `cat .env.local | fly secrets import` (or `fly secrets set KEY=value` per var).
8. `fly deploy`.
9. Smoke test on the `*.fly.dev` URL: sign up → vote 5 pairs → view leaderboard → confirm names render and headshots load from cdn.nba.com.
10. Push a trivial change to `main` to verify the GitHub Actions → Fly deploy round-trip works end-to-end.

Estimated effort: half a day for code changes, ~30 min for deploy + seed.

## Decisions (locked)

1. Repo: `mayoyoyo/baddest-nba`, private.
2. App title: "Baddest in the L".
3. Faceless filter only — drop the 8 players in `players.faceless.json`. Free agents stay (they have headshots, just no team). Final voting pool: **571 players**.
