# Face Ranking Hosted App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-fixed-cost hosted web app that lets signed-in users rank one shared pool of face photos through pairwise voting, with both shared and per-user personal leaderboards.

**Architecture:** Use a Cloudflare-first stack: a React SPA on Cloudflare Pages, Hono-powered Pages Functions for the API, D1 for application data, and R2 for image storage. Keep domain logic platform-agnostic where possible so rating, aggregation, and pairing code can later move to a different backend if needed.

**Tech Stack:** TypeScript, React, React Router, Vite, Hono, Cloudflare Pages Functions, Cloudflare D1, Cloudflare R2, Cloudflare Turnstile, Vitest, React Testing Library, Playwright

---

## Scope Check

This plan covers one coherent subsystem: the MVP hosted app described in the approved design spec at [2026-04-17-face-ranking-hosted-design.md](/Users/warrenkang/Documents/Codex/2026-04-17-make-me-a-new-project-and/baddest/docs/superpowers/specs/2026-04-17-face-ranking-hosted-design.md). It does not include optional future systems such as comments, multi-project management, or push realtime.

## Proposed File Structure

### Root configuration

- Create: `package.json`
  - Single source of truth for scripts and dependencies.
- Create: `wrangler.jsonc`
  - Cloudflare Pages/Workers bindings for D1, R2, and env vars.
- Create: `tsconfig.json`
  - Shared TypeScript config.
- Create: `vite.config.ts`
  - Frontend build config.
- Create: `vitest.config.ts`
  - Unit and integration test config.
- Create: `playwright.config.ts`
  - Browser E2E config.
- Create: `.dev.vars.example`
  - Document local env vars without storing secrets.

### Frontend

- Create: `src/client/main.tsx`
  - React entry point.
- Create: `src/client/App.tsx`
  - Top-level router shell.
- Create: `src/client/styles.css`
  - Global styles.
- Create: `src/client/lib/api.ts`
  - Typed fetch wrapper and API helpers.
- Create: `src/client/lib/session.ts`
  - Current-user state helpers.
- Create: `src/client/lib/polling.ts`
  - Lightweight polling utility for leaderboard refresh.
- Create: `src/client/lib/imagePrep.ts`
  - Client-side generation of display-sized upload variants.
- Create: `src/client/components/AuthForm.tsx`
  - Shared username/PIN form.
- Create: `src/client/components/ImagePair.tsx`
  - Voting pair presentation.
- Create: `src/client/components/LeaderboardTable.tsx`
  - Shared/personal leaderboard renderer.
- Create: `src/client/components/ConfidenceBadge.tsx`
  - Compact confidence display.
- Create: `src/client/routes/LoginPage.tsx`
  - Login route.
- Create: `src/client/routes/SignupPage.tsx`
  - Signup route.
- Create: `src/client/routes/VotePage.tsx`
  - Primary vote workflow.
- Create: `src/client/routes/SharedLeaderboardPage.tsx`
  - Shared leaderboard with polling.
- Create: `src/client/routes/UserLeaderboardPage.tsx`
  - Per-user leaderboard and summary stats.
- Create: `src/client/routes/AdminUploadPage.tsx`
  - Admin upload interface.

### Server

- Create: `functions/api/[[route]].ts`
  - Pages Functions entrypoint that adapts requests to the Hono app.
- Create: `src/server/app.ts`
  - Hono app construction and route mounting.
- Create: `src/server/types.ts`
  - Env bindings and shared API types.
- Create: `src/server/lib/db.ts`
  - D1 connection helpers and transaction helpers.
- Create: `src/server/lib/json.ts`
  - Consistent API JSON responses.
- Create: `src/server/lib/cookies.ts`
  - Session cookie helpers.
- Create: `src/server/lib/turnstile.ts`
  - Turnstile verification.
- Create: `src/server/lib/pin.ts`
  - PIN hashing and verification.
- Create: `src/server/lib/auth.ts`
  - Session lookup, guards, and role checks.
- Create: `src/server/lib/rateLimit.ts`
  - Username/IP-based auth rate limiting backed by D1.
- Create: `src/server/lib/storage.ts`
  - R2 put/get helpers.
- Create: `src/server/repositories/usersRepo.ts`
  - User and session persistence.
- Create: `src/server/repositories/imagesRepo.ts`
  - Image persistence and lookup.
- Create: `src/server/repositories/votesRepo.ts`
  - Vote event persistence.
- Create: `src/server/repositories/leaderboardsRepo.ts`
  - Personal/shared state persistence and reads.
- Create: `src/server/domain/rating.ts`
  - Elo-style personal rating updates.
- Create: `src/server/domain/confidence.ts`
  - Confidence calculations.
- Create: `src/server/domain/pairing.ts`
  - Next-pair selection.
- Create: `src/server/domain/sharedAggregation.ts`
  - Activity-weighted saturation logic and shared score aggregation.
- Create: `src/server/services/authService.ts`
  - Signup, login, logout.
- Create: `src/server/services/voteService.ts`
  - Atomic vote processing across all ranking contexts.
- Create: `src/server/services/leaderboardService.ts`
  - Shared/personal leaderboard reads.
- Create: `src/server/services/uploadService.ts`
  - Admin upload orchestration.
- Create: `src/server/routes/auth.ts`
  - Auth endpoints.
- Create: `src/server/routes/vote.ts`
  - Pair fetch and vote submit endpoints.
- Create: `src/server/routes/leaderboards.ts`
  - Shared and personal leaderboard endpoints.
- Create: `src/server/routes/images.ts`
  - Authenticated image responses.
- Create: `src/server/routes/admin.ts`
  - Admin image upload endpoints.

### Database and docs

- Create: `migrations/0001_initial_schema.sql`
  - All MVP tables and indexes.
- Create: `migrations/0002_seed_support.sql`
  - Optional seed helpers for local development only.
- Create: `docs/operations/admin-bootstrap.md`
  - How to promote one existing user to admin with a D1 command.
- Create: `docs/operations/deploy.md`
  - Cloudflare deployment steps.

### Tests

- Create: `tests/unit/rating.test.ts`
- Create: `tests/unit/confidence.test.ts`
- Create: `tests/unit/pairing.test.ts`
- Create: `tests/unit/sharedAggregation.test.ts`
- Create: `tests/integration/auth.test.ts`
- Create: `tests/integration/vote.test.ts`
- Create: `tests/integration/leaderboards.test.ts`
- Create: `tests/e2e/vote-flow.spec.ts`

## Implementation Notes

- Prefer plain SQL migrations instead of introducing an ORM now. D1 row-read limits make index control important, and the schema is small.
- Keep the Worker-facing code thin. Complex ranking logic belongs in `src/server/domain/`.
- Use D1 transactions for vote writes so `vote_events`, `personal_image_state`, `shared_image_state`, and `user_state` stay in sync.
- For admin ownership, do not build a complex bootstrap system yet. Promote one known username to `admin` manually through D1 after signup, document it, and keep the app code simpler.
- For image derivatives, generate the display-sized upload variant in the browser on the admin upload page and upload both original and display assets through the API.

## Tasks

### Task 1: Scaffold the project and test harness

**Files:**
- Create: `package.json`
- Create: `wrangler.jsonc`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.dev.vars.example`
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/styles.css`
- Create: `functions/api/[[route]].ts`
- Create: `src/server/app.ts`
- Test: `tests/unit/smoke.test.ts`

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from 'vitest'
import app from '../../src/server/app'

describe('server smoke', () => {
  it('exposes a health endpoint', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/smoke.test.ts`
Expected: FAIL with module-not-found errors for `src/server/app`.

- [ ] **Step 3: Add the minimum project scaffold**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

```ts
import { Hono } from 'hono'

const app = new Hono()
app.get('/api/health', (c) => c.json({ ok: true }))

export default app
```

- [ ] **Step 4: Run the smoke test and typecheck**

Run: `npm run test:unit -- tests/unit/smoke.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json wrangler.jsonc tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts .dev.vars.example src/client/main.tsx src/client/App.tsx src/client/styles.css functions/api/[[route]].ts src/server/app.ts tests/unit/smoke.test.ts
git commit -m "chore: scaffold cloudflare face ranking app"
```

### Task 2: Create the D1 schema and persistence helpers

**Files:**
- Create: `migrations/0001_initial_schema.sql`
- Create: `src/server/lib/db.ts`
- Create: `src/server/repositories/usersRepo.ts`
- Create: `src/server/repositories/imagesRepo.ts`
- Create: `src/server/repositories/votesRepo.ts`
- Create: `src/server/repositories/leaderboardsRepo.ts`
- Test: `tests/integration/schema.test.ts`

- [ ] **Step 1: Write the failing schema integration test**

```ts
it('creates the users table with unique usernames', async () => {
  const result = await db.prepare("PRAGMA table_info(users)").all()
  expect(result.results.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run the schema test to verify it fails**

Run: `npm run test:unit -- tests/integration/schema.test.ts`
Expected: FAIL because the `users` table does not exist.

- [ ] **Step 3: Write the initial migration**

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  last_active_at TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

- [ ] **Step 4: Add the remaining tables and indexes**

Include:
- `images`
- `vote_events`
- `personal_image_state`
- `shared_image_state`
- `user_state`
- `auth_attempts`
- indexes on `vote_events.user_id`, `personal_image_state.user_id`, `shared_image_state.rank_position`

- [ ] **Step 5: Add D1 helpers and repository stubs**

```ts
export function repoResult<T>(result: T): T {
  return result
}
```

- [ ] **Step 6: Run migration-aware tests**

Run: `npm run test:unit -- tests/integration/schema.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add migrations/0001_initial_schema.sql src/server/lib/db.ts src/server/repositories/usersRepo.ts src/server/repositories/imagesRepo.ts src/server/repositories/votesRepo.ts src/server/repositories/leaderboardsRepo.ts tests/integration/schema.test.ts
git commit -m "feat: add d1 schema and repository scaffolding"
```

### Task 3: Implement auth, sessions, and abuse protection

**Files:**
- Create: `src/server/lib/pin.ts`
- Create: `src/server/lib/cookies.ts`
- Create: `src/server/lib/turnstile.ts`
- Create: `src/server/lib/rateLimit.ts`
- Create: `src/server/lib/auth.ts`
- Create: `src/server/services/authService.ts`
- Create: `src/server/routes/auth.ts`
- Create: `src/client/components/AuthForm.tsx`
- Create: `src/client/routes/LoginPage.tsx`
- Create: `src/client/routes/SignupPage.tsx`
- Create: `src/client/lib/api.ts`
- Create: `src/client/lib/session.ts`
- Test: `tests/integration/auth.test.ts`

- [ ] **Step 1: Write the failing auth tests**

```ts
it('signs up a user with username and pin', async () => {
  const res = await app.request('/api/signup', {
    method: 'POST',
    body: JSON.stringify({ username: 'warren', pin: '1234', turnstileToken: 'ok' }),
    headers: { 'content-type': 'application/json' }
  })
  expect(res.status).toBe(201)
})

it('locks repeated failed logins', async () => {
  expect(await attemptBadLogins('warren', 6)).toBe(429)
})
```

- [ ] **Step 2: Run auth tests to verify they fail**

Run: `npm run test:unit -- tests/integration/auth.test.ts`
Expected: FAIL because `/api/signup` and `/api/login` do not exist.

- [ ] **Step 3: Implement PIN hashing and session cookies**

```ts
export async function hashPin(pin: string): Promise<string> {}
export async function verifyPin(pin: string, hash: string): Promise<boolean> {}
export function createSessionCookie(token: string): string {}
```

- [ ] **Step 4: Implement Turnstile verification with local test bypass**

```ts
export async function verifyTurnstile(token: string, env: Env): Promise<boolean> {
  if (env.TURNSTILE_BYPASS === 'true') return true
  return true
}
```

- [ ] **Step 5: Implement auth endpoints and guards**

Add:
- `POST /api/signup`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`

- [ ] **Step 6: Build login and signup pages**

UI requirements:
- username field
- 4-digit PIN field
- error state
- redirect to `/vote` on success

- [ ] **Step 7: Run auth tests, then typecheck**

Run: `npm run test:unit -- tests/integration/auth.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/lib/pin.ts src/server/lib/cookies.ts src/server/lib/turnstile.ts src/server/lib/rateLimit.ts src/server/lib/auth.ts src/server/services/authService.ts src/server/routes/auth.ts src/client/components/AuthForm.tsx src/client/routes/LoginPage.tsx src/client/routes/SignupPage.tsx src/client/lib/api.ts src/client/lib/session.ts tests/integration/auth.test.ts
git commit -m "feat: add lightweight auth and session handling"
```

### Task 4: Implement personal rating, confidence, and shared aggregation

**Files:**
- Create: `src/server/domain/rating.ts`
- Create: `src/server/domain/confidence.ts`
- Create: `src/server/domain/sharedAggregation.ts`
- Test: `tests/unit/rating.test.ts`
- Test: `tests/unit/confidence.test.ts`
- Test: `tests/unit/sharedAggregation.test.ts`

- [ ] **Step 1: Write the failing domain tests**

```ts
it('raises winner rating and lowers loser rating', () => {
  const next = applyEloVote({ winner: 1200, loser: 1200, k: 32 })
  expect(next.winner).toBeGreaterThan(1200)
  expect(next.loser).toBeLessThan(1200)
})

it('saturates shared influence weight', () => {
  expect(userInfluenceWeight(0, 40)).toBeCloseTo(0)
  expect(userInfluenceWeight(200, 40)).toBeLessThanOrEqual(1)
})
```

- [ ] **Step 2: Run the domain tests to verify they fail**

Run: `npm run test:unit -- tests/unit/rating.test.ts tests/unit/confidence.test.ts tests/unit/sharedAggregation.test.ts`
Expected: FAIL with missing exports.

- [ ] **Step 3: Implement the Elo update and confidence helpers**

```ts
export function applyEloVote(input: { winner: number; loser: number; k: number }) {
  const expectedWinner = 1 / (1 + 10 ** ((input.loser - input.winner) / 400))
  return {
    winner: input.winner + input.k * (1 - expectedWinner),
    loser: input.loser + input.k * (0 - (1 - expectedWinner)),
  }
}
```

- [ ] **Step 4: Implement the shared aggregation helpers**

```ts
export function userInfluenceWeight(votesCast: number, threshold: number) {
  return 1 - Math.exp(-votesCast / threshold)
}
```

Include:
- user score normalization
- aggregate weighted mean per image
- shared confidence summary

- [ ] **Step 5: Run the domain test suite**

Run: `npm run test:unit -- tests/unit/rating.test.ts tests/unit/confidence.test.ts tests/unit/sharedAggregation.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/domain/rating.ts src/server/domain/confidence.ts src/server/domain/sharedAggregation.ts tests/unit/rating.test.ts tests/unit/confidence.test.ts tests/unit/sharedAggregation.test.ts
git commit -m "feat: add ranking and shared aggregation domain logic"
```

### Task 5: Implement pairing and atomic vote processing

**Files:**
- Create: `src/server/domain/pairing.ts`
- Create: `src/server/services/voteService.ts`
- Create: `src/server/routes/vote.ts`
- Modify: `src/server/repositories/votesRepo.ts`
- Modify: `src/server/repositories/leaderboardsRepo.ts`
- Test: `tests/unit/pairing.test.ts`
- Test: `tests/integration/vote.test.ts`

- [ ] **Step 1: Write the failing pairing and vote tests**

```ts
it('avoids immediately repeating the last pair', () => {
  const pair = selectNextPair(fixtures)
  expect(pair).not.toEqual(['img-1', 'img-2'])
})

it('writes one vote event and returns the next pair', async () => {
  const res = await app.request('/api/vote', { method: 'POST', body: votePayload })
  expect(res.status).toBe(200)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- tests/unit/pairing.test.ts tests/integration/vote.test.ts`
Expected: FAIL because pairing and vote service are not implemented.

- [ ] **Step 3: Implement user-scoped pairing**

Include:
- least-compared or least-confident anchor image
- broader opponents early
- closer-in-score opponents later
- recent-pair avoidance

- [ ] **Step 4: Implement atomic vote processing**

Inside one transaction:
- insert `vote_events` row
- update winner and loser in `personal_image_state`
- update `user_state.total_votes_cast`
- recompute current user's normalized scores
- recompute `shared_image_state`
- select and return next pair

- [ ] **Step 5: Expose API endpoints**

Add:
- `GET /api/pair`
- `POST /api/vote`

- [ ] **Step 6: Run the vote tests**

Run: `npm run test:unit -- tests/unit/pairing.test.ts tests/integration/vote.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/domain/pairing.ts src/server/services/voteService.ts src/server/routes/vote.ts src/server/repositories/votesRepo.ts src/server/repositories/leaderboardsRepo.ts tests/unit/pairing.test.ts tests/integration/vote.test.ts
git commit -m "feat: add pair selection and atomic vote processing"
```

### Task 6: Implement shared and personal leaderboard read APIs

**Files:**
- Create: `src/server/services/leaderboardService.ts`
- Create: `src/server/routes/leaderboards.ts`
- Modify: `src/server/repositories/imagesRepo.ts`
- Modify: `src/server/repositories/leaderboardsRepo.ts`
- Test: `tests/integration/leaderboards.test.ts`

- [ ] **Step 1: Write the failing leaderboard API tests**

```ts
it('returns the shared leaderboard ordered by aggregate score', async () => {
  const res = await app.request('/api/leaderboard/shared')
  expect(res.status).toBe(200)
})

it('returns a user leaderboard with votes and confidence summary', async () => {
  const res = await app.request('/api/leaderboard/personal/warren')
  expect(res.status).toBe(200)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/integration/leaderboards.test.ts`
Expected: FAIL because the leaderboard routes do not exist.

- [ ] **Step 3: Implement read models and endpoints**

Add:
- `GET /api/leaderboard/shared`
- `GET /api/leaderboard/personal/:username`
- `GET /api/users/:username/stats`

Response should include:
- ordered image rows
- image IDs and display URLs
- confidence
- total votes cast on personal page

- [ ] **Step 4: Run the leaderboard API tests**

Run: `npm run test:unit -- tests/integration/leaderboards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/leaderboardService.ts src/server/routes/leaderboards.ts src/server/repositories/imagesRepo.ts src/server/repositories/leaderboardsRepo.ts tests/integration/leaderboards.test.ts
git commit -m "feat: add shared and personal leaderboard endpoints"
```

### Task 7: Build the vote-first frontend flow

**Files:**
- Create: `src/client/components/ImagePair.tsx`
- Create: `src/client/components/ConfidenceBadge.tsx`
- Create: `src/client/routes/VotePage.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/lib/api.ts`
- Test: `src/client/routes/VotePage.test.tsx`

- [ ] **Step 1: Write the failing VotePage UI test**

```tsx
it('shows two images and posts a vote', async () => {
  render(<VotePage />)
  expect(await screen.findByRole('button', { name: /choose left/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the VotePage test to verify it fails**

Run: `npm run test:unit -- src/client/routes/VotePage.test.tsx`
Expected: FAIL because `VotePage` is missing.

- [ ] **Step 3: Implement the vote page**

Requirements:
- load `/api/pair` on entry
- render two authenticated image URLs
- submit one winner choice to `/api/vote`
- immediately replace the pair from the API response
- show personal/shared confidence summaries

- [ ] **Step 4: Run the VotePage test and typecheck**

Run: `npm run test:unit -- src/client/routes/VotePage.test.tsx`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/ImagePair.tsx src/client/components/ConfidenceBadge.tsx src/client/routes/VotePage.tsx src/client/App.tsx src/client/lib/api.ts src/client/routes/VotePage.test.tsx
git commit -m "feat: add vote-first frontend flow"
```

### Task 8: Build leaderboard pages with low-cost polling

**Files:**
- Create: `src/client/components/LeaderboardTable.tsx`
- Create: `src/client/lib/polling.ts`
- Create: `src/client/routes/SharedLeaderboardPage.tsx`
- Create: `src/client/routes/UserLeaderboardPage.tsx`
- Modify: `src/client/App.tsx`
- Test: `src/client/routes/SharedLeaderboardPage.test.tsx`
- Test: `src/client/routes/UserLeaderboardPage.test.tsx`

- [ ] **Step 1: Write the failing leaderboard page tests**

```tsx
it('polls the shared leaderboard on an interval', async () => {
  render(<SharedLeaderboardPage />)
  expect(await screen.findByText(/shared leaderboard/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the leaderboard page tests to verify they fail**

Run: `npm run test:unit -- src/client/routes/SharedLeaderboardPage.test.tsx src/client/routes/UserLeaderboardPage.test.tsx`
Expected: FAIL with missing components.

- [ ] **Step 3: Implement the shared and personal leaderboard pages**

Requirements:
- shared page polls every 5-10 seconds
- personal page shows ordered rows, total votes cast, and confidence
- both pages link back to `/vote`

- [ ] **Step 4: Run the leaderboard page tests**

Run: `npm run test:unit -- src/client/routes/SharedLeaderboardPage.test.tsx src/client/routes/UserLeaderboardPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/LeaderboardTable.tsx src/client/lib/polling.ts src/client/routes/SharedLeaderboardPage.tsx src/client/routes/UserLeaderboardPage.tsx src/client/App.tsx src/client/routes/SharedLeaderboardPage.test.tsx src/client/routes/UserLeaderboardPage.test.tsx
git commit -m "feat: add shared and personal leaderboard pages"
```

### Task 9: Add admin upload flow and authenticated image delivery

**Files:**
- Create: `src/server/lib/storage.ts`
- Create: `src/server/services/uploadService.ts`
- Create: `src/server/routes/images.ts`
- Create: `src/server/routes/admin.ts`
- Create: `src/client/lib/imagePrep.ts`
- Create: `src/client/routes/AdminUploadPage.tsx`
- Test: `tests/integration/upload.test.ts`
- Test: `src/client/routes/AdminUploadPage.test.tsx`

- [ ] **Step 1: Write the failing upload tests**

```ts
it('rejects upload for non-admin users', async () => {
  const res = await app.request('/api/admin/images/upload', { method: 'POST', body: fakeForm })
  expect(res.status).toBe(403)
})
```

- [ ] **Step 2: Run the upload tests to verify they fail**

Run: `npm run test:unit -- tests/integration/upload.test.ts src/client/routes/AdminUploadPage.test.tsx`
Expected: FAIL because admin upload routes and page do not exist.

- [ ] **Step 3: Implement authenticated image delivery**

Add:
- `GET /api/images/:imageId`

Behavior:
- require valid session
- fetch display asset from R2
- return image bytes with correct content type

- [ ] **Step 4: Implement admin upload**

Behavior:
- admin-only route
- accept original file plus client-prepared display variant
- write both to R2
- create `images` row

- [ ] **Step 5: Build the admin upload page**

Requirements:
- file picker
- preview list
- client-side display resize
- per-file success/failure feedback

- [ ] **Step 6: Run the upload tests**

Run: `npm run test:unit -- tests/integration/upload.test.ts src/client/routes/AdminUploadPage.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/lib/storage.ts src/server/services/uploadService.ts src/server/routes/images.ts src/server/routes/admin.ts src/client/lib/imagePrep.ts src/client/routes/AdminUploadPage.tsx tests/integration/upload.test.ts src/client/routes/AdminUploadPage.test.tsx
git commit -m "feat: add admin image upload and protected image delivery"
```

### Task 10: Add deployment docs, admin bootstrap docs, and end-to-end verification

**Files:**
- Create: `docs/operations/admin-bootstrap.md`
- Create: `docs/operations/deploy.md`
- Create: `tests/e2e/vote-flow.spec.ts`
- Modify: `package.json`
- Modify: `.dev.vars.example`

- [ ] **Step 1: Write the failing E2E test**

```ts
test('signup, vote, and leaderboard refresh works', async ({ page }) => {
  await page.goto('/signup')
  await page.fill('[name="username"]', 'warren')
  await page.fill('[name="pin"]', '1234')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/vote/)
})
```

- [ ] **Step 2: Run the E2E test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/vote-flow.spec.ts`
Expected: FAIL because the local app is not fully wired for end-to-end flow yet.

- [ ] **Step 3: Add operational docs**

`docs/operations/admin-bootstrap.md` must include:

```bash
npx wrangler d1 execute <DB_NAME> --remote --command \
"UPDATE users SET role = 'admin' WHERE username = 'your-username';"
```

`docs/operations/deploy.md` must include:
- create D1 database
- create R2 bucket
- set Turnstile secret
- bind resources in `wrangler.jsonc`
- deploy to Cloudflare Pages

- [ ] **Step 4: Make the E2E flow pass locally**

Run:
- `npm run build`
- `npm run test:e2e -- tests/e2e/vote-flow.spec.ts`

Expected:
- build succeeds
- E2E passes

- [ ] **Step 5: Run the full verification suite**

Run:
- `npm run test:unit`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e`

Expected:
- all commands PASS

- [ ] **Step 6: Commit**

```bash
git add docs/operations/admin-bootstrap.md docs/operations/deploy.md tests/e2e/vote-flow.spec.ts package.json .dev.vars.example
git commit -m "docs: add deployment and bootstrap instructions"
```

## Self-Review Checklist

- [ ] The plan preserves the approved product scope: one shared pool, one shared leaderboard, one personal leaderboard per user.
- [ ] The plan does not add comments, undo, vote history UI, or multi-project UX.
- [ ] The plan keeps the stack on free-tier-friendly Cloudflare services.
- [ ] The plan includes rate limiting and Turnstile because PIN auth is weak.
- [ ] The plan uses D1 indexes to reduce row-read cost.
- [ ] The plan keeps ranking logic isolated from Cloudflare platform bindings.
- [ ] The plan includes exact file paths, commands, tests, and commit points.

## Review Notes

Subagent-based plan review was not executed here because delegated agents were not explicitly requested in this conversation. Before implementation starts, do one additional manual pass against the approved design spec to confirm the plan still matches the product decisions.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-face-ranking-hosted-implementation.md`. Ready to execute?
