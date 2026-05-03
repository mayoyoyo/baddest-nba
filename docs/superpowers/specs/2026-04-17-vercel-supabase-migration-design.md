# Vercel and Supabase Migration Design

Date: 2026-04-17
Status: Approved for planning

## Summary

Migrate the hosted face-ranking app from a Cloudflare-specific stack to a Vercel and Supabase stack optimized for free-tier deployment and Git-based hosting.

The migration keeps the product shape intact:

- one shared image pool
- one shared collaborative leaderboard
- one personal leaderboard per signed-in user
- one admin upload flow
- custom username plus 4-digit PIN login

The migration changes infrastructure, not product behavior.

## Why This Migration

The current app is built around Cloudflare Pages, D1, and R2. That stack is technically suitable, but the target account currently requires enabling an R2 subscription flow the user does not want to rely on.

The new target must satisfy:

- free or effectively free at 4-6 users
- Git-based deployment from a hosted repository
- image uploads and storage
- relational data for votes, rankings, and sessions
- no forced redesign of the current username and PIN flow

## Recommended Stack

- Vercel Hobby for frontend hosting and serverless API routes
- Supabase Free for Postgres and Storage
- Hono retained as the API router inside Vercel
- custom cookie-based auth retained in app code

## Why This Stack

### Vercel

- straightforward "connect repo and deploy" workflow
- free Hobby plan suitable for a very small private app
- Hono supports Vercel directly

### Supabase

- free Postgres project with enough room for this app
- free Storage suitable for the image pool
- simple dashboard for migrations and storage inspection
- serverless-safe pooled Postgres connection strings are available through Supavisor transaction pooling for serverless workloads

This conclusion is based on current official docs for Vercel Hobby, Supabase free plans, Supabase connection pooling, and Hono on Vercel.

## Explicit Non-Goals

- moving auth to Supabase Auth
- redesigning the frontend
- changing the ranking model
- adding comments, history, undo, or multi-project support
- building realtime sockets or subscriptions for MVP

## Architecture

### Frontend

The React SPA remains essentially unchanged. It will still call same-origin `/api/*` routes and render the same routes:

- `/login`
- `/signup`
- `/vote`
- `/leaderboard`
- `/users/:username`
- `/admin/upload`

### API Runtime

The Hono app remains the main API surface. The Cloudflare adapter is removed and replaced with a Vercel adapter.

Target shape:

- keep `src/server/app.ts` as the main Hono router
- replace the Cloudflare worker entrypoint with a Vercel entrypoint under `api/`
- remove Cloudflare binding assumptions from server types and helpers

### Database

Cloudflare D1 is replaced by Supabase Postgres.

The app will connect directly from Vercel API routes to Supabase Postgres through the transaction pooler connection string intended for serverless workloads. Prepared statements must remain disabled for this mode.

We will keep raw SQL and repository modules rather than introducing an ORM during the migration. That keeps the diff smaller and preserves ranking logic behavior.

### Storage

Cloudflare R2 is replaced by Supabase Storage.

One private bucket will hold image assets:

- `display/<image-id>`
- `original/<image-id>`

Images remain private. The existing `/api/images/:imageId` route continues to proxy image bytes after verifying the signed-in user.

### Auth

Custom auth remains.

The app will continue to store:

- `users`
- `sessions`
- hashed PINs
- rate limit state

Supabase Auth is intentionally not used because the product requires username plus 4-digit PIN login, not email/password or magic-link flows.

### Live Updates

The app does not need paid realtime infrastructure. The leaderboard can continue with request/refresh behavior and lightweight client polling.

## Data Model Mapping

The current D1 schema maps directly to Postgres with minor syntax updates.

Core tables stay conceptually the same:

- `users`
- `sessions`
- `images`
- `vote_events`
- `personal_image_state`
- `shared_image_state`
- `user_state`
- `auth_attempts`

Main SQL changes:

- use Postgres `text`, `integer`, `double precision`, and `timestamp with time zone`
- replace SQLite-specific upsert/binding patterns with Postgres syntax
- preserve unique constraints and indexes

## Service-Level Design

### Ranking Logic

The ranking code stays ours:

- Elo update logic remains in `src/server/domain/rating.ts`
- pairing remains in `src/server/domain/pairing.ts`
- confidence remains in `src/server/domain/confidence.ts`
- shared aggregation remains in `src/server/domain/sharedAggregation.ts`

This is conceptually inspired by Kura, but not a direct Kura runtime dependency.

### Repositories

Repository modules will be ported from D1 prepared statements to Postgres query helpers.

The goal is to keep service modules mostly intact by preserving repository-level interfaces wherever practical.

### Upload Flow

The admin upload page already prepares a display-sized image client-side. That logic stays.

Server upload flow changes from:

- put object into R2
- insert image row into D1

to:

- upload display and original blobs into Supabase Storage
- insert image row into Postgres

Filename-derived image IDs remain in place so leaderboard labels stay human-readable.

## Deployment Model

### Vercel

The repo will be deployable by importing it into Vercel and setting environment variables.

Expected Vercel environment variables:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TURNSTILE_BYPASS`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY` optional if bypass stays enabled for MVP

### Supabase

Expected Supabase setup:

- one project
- one Postgres database
- one private storage bucket for images
- SQL migration files checked into the repo

## Testing Strategy

The Cloudflare worker integration test harness will be removed.

The new test shape:

- unit tests for domain logic remain
- route/app tests run against the Hono app in a Node/Vercel-compatible environment
- repository tests can run against a dedicated Postgres test database or be covered through app-level integration tests where practical
- frontend unit tests remain with Vitest

Because this is a platform migration, deployability matters as much as test pass rate. The migration is only complete when:

- `npm run typecheck` passes
- `npm run build` passes
- representative unit tests pass
- the app runs locally in the Vercel-compatible dev flow
- deploy docs exist for Vercel and Supabase

## Migration Order

1. Swap runtime and config from Cloudflare to Vercel.
2. Add Supabase/Postgres environment and SQL migration foundation.
3. Port repositories from D1 to Postgres.
4. Port storage from R2 to Supabase Storage.
5. Update tests and local dev flow.
6. Document deployment and manual setup.

This order keeps the Hono app and ranking logic intact while replacing the platform-specific surfaces underneath.

## Main Risks

### Risk 1: Transaction semantics drift

Vote processing updates multiple state tables. The Postgres port must preserve atomicity so votes do not partially apply.

Mitigation:

- use explicit Postgres transactions in the vote service path
- add integration coverage around vote persistence effects

### Risk 2: Local development friction

The current local flow is Cloudflare-specific.

Mitigation:

- standardize local API execution on a Vercel-compatible dev command
- document required env vars in `.env.example`

### Risk 3: Storage privacy regressions

Images must stay private to signed-in users.

Mitigation:

- keep the private image proxy route
- do not expose raw public object URLs

### Risk 4: Free-tier limits

This stack is optimized for a tiny app, not large-scale public traffic.

Mitigation:

- keep polling simple
- keep image sizes modest
- avoid unnecessary background jobs and realtime systems

## Approval Outcome

Approved migration approach:

- Vercel + Supabase
- keep custom username + PIN auth
- keep current product behavior
- optimize for free-tier deployment and Git-based hosting
