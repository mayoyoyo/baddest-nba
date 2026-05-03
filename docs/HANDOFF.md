# Handoff — baddest-nba

**Date:** 2026-05-03
**Live:** https://baddest.fly.dev
**Repo:** https://github.com/mayoyoyo/baddest-nba (public)
**Owner:** Hanson Kang (`mayoyoyo`)

---

## What this is

NBA player headshot ranker — blind 1v1 voting on looks. Engine forked from a
prior `baddest` project, frontend/branding rebuilt. Deployed as a single Node
container on Fly.io against a Neon Postgres.

---

## Stack

- **Backend:** Hono, runs as a Node server (`@hono/node-server`) in a
  multi-stage Docker container. Single-process, multi-machine on Fly.
- **Frontend:** React 19 + Vite + Tailwind v4 + hand-rolled shadcn-style
  components. Light/dark themed via CSS vars on `.dark`.
- **DB:** Neon Postgres via `pg.Pool` and a thin DbClient wrapper
  (`src/server/lib/db.ts`). Direct SQL only — no ORM.
- **Image hosting:** hotlinked from `cdn.nba.com` (free, NBA's own CDN). We
  store no image bytes; `images.id` is the NBA `personId`.
- **Hosting:** Fly app `baddest`, region `iad`. Auto-stop, auto-start, 512mb
  shared CPU.
- **CI:** `.github/workflows/fly-deploy.yml` runs `flyctl deploy --remote-only`
  on push to `main`. Token is the `FLY_API_TOKEN` repo secret.
- **No image storage.** No queueing. No background jobs.

---

## Local dev quickstart

```bash
git clone git@github.com:mayoyoyo/baddest-nba.git
cd baddest-nba
npm install

# .env.local must contain DATABASE_URL pointing at Neon (not committed)
# the existing one on the maintainer's machine has the live Neon string
npm run dev:server   # API on :8080 (uses .env.local)
npm run dev          # Vite on :5173, proxies /api -> :8080
```

Tests: `npm run test:unit` (vitest, no DB needed). Typecheck: `npm run typecheck`.

Reseed the roster from `data/players.json` (idempotent, hides players who
dropped from the roster, refreshes team/jersey/pos):

```bash
npm run seed
```

---

## Architecture, briefly

### Directory layout

```
src/
  client/                  # React SPA
    App.tsx, main.tsx
    components/            # AppShell, Avatar, AuthForm, PinInput, ThemeToggle, ui/*
    contexts/AuthContext.tsx
    routes/                # VotePage, LeaderboardPage, MePage, LoginPage, SignupPage
    lib/{api.ts,cn.ts}
    styles.css             # Tailwind + theme vars
  server/                  # Hono app
    app.ts, node.ts        # node.ts is the Fly entry; app.ts mounts routes
    routes/                # auth, leaderboards, vote
    services/              # authService, voteService, leaderboardService, leaderboardCache
    repositories/          # imagesRepo, leaderboardsRepo, playersRepo, usersRepo, votesRepo
    domain/                # rating, pairing, confidence, sharedAggregation (pure functions)
    lib/                   # auth (middleware), cookies, db, env, pin, rateLimit, runtime, turnstile, visibleUsers
    types.ts
data/players.json          # 579 NBA players (id, first, last, team, jersey, pos)
scripts/seed-nba-players.ts
supabase/migrations/       # 20260502_0001_initial_schema.sql + 20260503_0002_guest_role.sql
docs/                      # this handoff + audit
.github/workflows/fly-deploy.yml
Dockerfile, fly.toml, vite.config.ts, tsconfig.{json,server.json}
```

### Engine model (you should know this before touching ratings)

- **ELO** with **dynamic K-factor decay**: K = 48 / 32 / 24 / 16 by an image's
  personal `comparisons` count (`src/server/domain/rating.ts`). Each side
  decays independently — a brand-new face vs a "Locked In" star uses K=48 on
  one side and K=16 on the other.
- **Skip is an ELO tie** (`applyEloTie`): both ratings nudge toward each other
  scaled by their gap and per-side K. Skip increments `comparisons` but not
  `total_votes_cast`.
- **Pair selection** (`src/server/domain/pairing.ts`): anchor-based.
  Anchors prioritized by least-compared then random within ties. Opponent is
  picked **randomly from the top 10** equally-good candidates (this fixes the
  "same opponent sticks across refreshes" bug — don't go back to deterministic
  picks). Recent-pair cooldown of 9, repeated-image dampening, exploratory
  vs refinement mode based on `rankingConfidence` < 0.6.
- **Personal leaderboard pre-seeds from global average rating** (not 1200) so
  new users see a meaningful ranking from vote 1 (`getGlobalImageRatingAverages`
  in `leaderboardsRepo.ts`, used in `getUserLeaderboard`).
- **Avatar (top-rated personal player)** requires `comparisons >= 2` so a
  one-shot win doesn't mint a permanent avatar.
- **Shared leaderboard cache** is in-memory, 60s TTL, invalidated on every
  vote and skip (`leaderboardCache.ts`). Cold reads ~900ms, cached ~10ms.
  Cache is per-process — fine on Fly because we're single-app.

### Auth model (guest + promote)

- **Guest sessions are created lazily** by the `ensureViewer` middleware on
  any vote/pair endpoint. Cookie set, `users` row created with `role='guest'`,
  `pin_hash='guest:no-login'` (sentinel that can never match a real PIN).
- **`/api/me` is public** — returns `{ user: null, ... }` if no cookie. Don't
  protect it.
- **Signup** for a guest cookie hits `/api/me/promote` (preserves ELO history)
  rather than `/api/signup` (which creates a fresh user). The `AuthForm`
  component picks the right endpoint based on current `user.role`.
- Guest votes are **filtered out of the shared leaderboard** via
  `isPublicVoter()` (`src/server/lib/auth.ts`). Promote a guest → all their
  votes immediately count toward shared rankings.

### Key API endpoints

```
GET  /api/health              -> {ok: true}
GET  /api/me                  -> {user, totalVotesCast, avatarImageId}  (no auth)
POST /api/signup              -> creates user, sets cookie
POST /api/login               -> sets cookie
POST /api/logout
POST /api/me/promote          -> guest -> user (preserves history)
GET  /api/pair                -> creates guest if needed; returns {pair: {left, right}}
POST /api/vote                -> {nextPair}
POST /api/pair/skip           -> {nextPair} (also moves ELO as tie)
POST /api/flush-actions       -> batch vote/skip replay (offline support)
GET  /api/leaderboard/shared  -> {leaderboard: [{image, player, aggregateScore, ...}]}  (public)
GET  /api/me/leaderboard      -> personal top, requires viewer
```

---

## What just shipped (last few commits)

```
265e352  lock mobile layout to viewport, shrink bottom nav
ba8fd68  fix cold-start, OTP-style PIN, stacked vote, big-red skip, skip-as-tie
e2c5654  add addictiveness audit (18 notes)
2ea5975  add guest mode, avatar evolution, mobile side-by-side, perf
b0977cd  rename Fly app baddest-nba -> baddest
d87074a  fix client/server contract mismatch on pair shape
```

The mobile layout is currently locked to viewport with `h-dvh` flex column —
header + main + bottom nav are inflexible shrink-0 siblings, main is
`min-h-0 flex-1`. **Vote page never scrolls.** Leaderboard and Me are the
only scrollable surfaces. Bottom nav is in-flow (not fixed-positioned),
which is what fixes the "card overflow" issue. Don't reintroduce
`fixed inset-x-0 bottom-0` on the nav.

---

## Open backlog

The full audit is in `docs/2026-05-03-addictiveness-audit.md` — 18 ranked
notes with effort tags, citations, and a "didn't make the cut" section.
The author's top 3 picks to ship next:

1. **Drop W/L from `/me`** (replace with rating + comparisons; W/L is
   misleading because the engine deliberately gives unequal exposure).
   ~5 minutes.
2. **ELO delta + name reveal post-vote** (variable-reward dopamine; reveal
   names AFTER the choice so they don't bias it). ~2-3 hours.
3. **Live "voting now" pulse** (one cheap query, makes the site feel
   inhabited). ~1 hour.

After those: daily streak (#2 in the audit) is the move that determines
whether anyone comes back tomorrow. Read the audit doc before picking
something else.

---

## Operational gotchas

- **Iterate on localhost before pushing.** CI deploys on every push to main
  and there's no preview environment. The first deploy went out with a
  client/server contract mismatch on `/api/pair` because nobody booted the
  app locally first. `npm run dev:server` + `npm run dev` (in two terminals)
  takes 10 seconds.
- **Don't reintroduce a fixed-position bottom nav.** It overflows the vote
  cards on phones with browser chrome. Keep the flex flow.
- **Don't reintroduce the deterministic pairing seed.** Pair selection uses
  `Math.random` and a top-10 candidate pool by design. Determinism caused
  refresh-shows-same-pair complaints.
- **Don't force `aspect-ratio` on the vote cards.** The flex layout sizes
  them; aspect-ratio fights the container and forces overflow. `object-cover`
  on the image fills the box.
- **Schema migrations are forward-only.** Two files under
  `supabase/migrations/`. Apply manually with `psql "$DATABASE_URL" -f
  <file>` against Neon. There's no migration runner.
- **`pg` library throws SSL warnings under Node 23+.** Harmless. The Pool
  is configured `ssl: { rejectUnauthorized: false }` which Neon needs.
- **The `players` table has a FK to `images.id`.** Don't `DELETE FROM
  images` without thinking about the cascade. The seed script uses
  `status='hidden'` instead of delete to preserve vote history.
- **Cache is in-memory.** If you ever scale to >1 Fly machine and notice
  staleness across requests, swap the cache to Redis or move to
  `shared_image_state` materialization (the table already exists).
- **`@supabase/supabase-js` was dropped.** We use direct Postgres now.
  Don't reintroduce it just because the env vars `SUPABASE_*` exist
  (they're vestigial; safe to ignore).
- **`SUPABASE_*` env vars in `.env.local` are unused.** Only `DATABASE_URL`
  matters. Same for `TURNSTILE_*` (we run with `TURNSTILE_BYPASS=true`).

---

## User preferences (validated through this build)

- **Action over discussion.** When in auto mode, just ship reasonable
  assumptions and expect course corrections. The user reads diffs and
  course-corrects directly.
- **Localhost-first.** Confirm a flow runs in a browser before pushing.
  This is the strongest preference — see gotchas above.
- **Mobile-first, viewport-locked.** No mobile scroll except on
  Leaderboard. Cards visible without scrolling. Nav compact.
- **Minimalist shadcn aesthetic.** Hand-rolled components in
  `src/client/components/ui/` (Button, Card, Input, Label) — don't pull
  in `shadcn/ui` CLI now that we have what we need.
- **Light + dark theme.** Both first-class. Theme is set pre-paint by an
  inline script in `index.html` to avoid flash.
- **PIN UX**: 4-box OTP-style input (`PinInput.tsx`), not a single
  password box.
- **Branding**: "Baddest in the L" — capital L means "the league".
  Don't change to "Baddest in the League" or "Baddest in the NBA".

---

## Where to find things

- Spec/design history: `docs/` (this file + the audit)
- Memory the previous agent saved (in the *original* baddest repo, not
  this one):
  `/Users/hansonkang/.claude/projects/-Users-hansonkang-Documents-GitHub-baddest/memory/`
  Notable: `feedback_localhost_first.md`.
- Fly dashboard: https://fly.io/apps/baddest
- Neon dashboard: https://console.neon.tech (project name in `.env.local`'s
  hostname)
