# Face Ranking Hosted App Design

Date: 2026-04-17
Status: Approved for planning

## Summary

Build a hosted browser app for ranking one shared pool of face photos through repeated head-to-head comparisons.

The app has:

- one shared image pool
- one shared collaborative leaderboard
- one personal leaderboard per signed-in user over the same image pool
- one admin/owner role that uploads images

The app is optimized for:

- zero fixed monthly cost if possible
- a very small user base, roughly 4-6 users
- a simple voting-first experience

## Product Decisions

### Core shape

- There is only one hosted app and one shared image pool for MVP.
- There is no multi-project creation flow in v1.
- Shared images are viewable by any signed-in user.
- Any signed-in user can vote on the shared pool.
- Owner/admin uploads images directly into the app.

### Rankings

- Each vote in the shared pool updates two ranking contexts:
  - the shared collaborative ranking
  - the voting user's personal ranking
- Shared ranking is not based on raw pooled vote count alone.
- Shared ranking uses activity-weighted saturation so active users gain influence up to a cap, then additional votes mostly improve their own confidence and coverage instead of dominating the shared result.

### Public user surface

- Other signed-in users can view a user's personal leaderboard.
- Public personal stats are limited to:
  - total votes cast
  - ranking confidence
- There is no visible raw vote history UI.
- There is no undo.
- There are no comments for MVP.

### Auth and privacy

- Authentication is self-serve signup with username plus 4-digit PIN.
- This is intentionally lightweight auth, not strong-security auth.
- Because face photos are involved, image access is still account-gated.
- The product should add rate limiting, lockouts, and abuse checks because a 4-digit PIN is weak.

### Hosting and cost

- Primary constraint is lowest possible monthly cost, ideally zero fixed cost.
- "Live" leaderboard updates may use periodic refresh instead of push realtime if that keeps the system on free tiers.

## Kura Reuse Assessment

Kura is reference material, not the product base.

Useful ideas to reuse conceptually:

- append-only vote events
- Elo-style pairwise ranking updates
- adaptive pair selection
- a visible reliability/confidence indicator
- the ability to recompute leaderboard state from vote history

Not suitable for direct reuse as architecture:

- PyQt desktop UI
- local filesystem and album management assumptions
- desktop history and delete workflows
- single-user SQLite shape

Not suitable for direct reuse as production code:

- the current Glicko implementation should be treated as reference, not copied as-is

Because Kura is GPLv3, implementation should re-express the useful ideas rather than copying source directly if future licensing flexibility matters.

## Recommended Architecture

Use a Cloudflare-first stack:

- Cloudflare Pages for the frontend
- Cloudflare Worker for API routes
- Cloudflare D1 for relational app data
- Cloudflare R2 for photo storage
- Cloudflare Turnstile for signup/login abuse protection

### Why this stack

- no fixed monthly cost at MVP scale
- one vendor and simple deployment model
- no always-on database bill
- no database inactivity pause problem like Supabase Free
- free egress on image storage via R2

### Explicit tradeoff

This is optimized for free hosting first, not for maximum enterprise readiness. The app should still be structured cleanly enough that it can later move to a paid Postgres-backed stack if needed.

## Non-Goals for MVP

- multi-project management
- invitations and role-rich collaboration models
- comments or discussion threads
- undo
- per-user visible vote history
- external photo import or sync
- desktop feature parity with Kura
- advanced moderation tooling

## User Experience

### Main routes

- `/login`
- `/signup`
- `/vote`
- `/leaderboard`
- `/users/:username`
- `/admin/upload`

### Primary workflow

1. User signs in with username and PIN.
2. User opens the voting page.
3. The app shows two face photos.
4. The user picks the better photo.
5. The response updates:
   - that user's personal ranking state immediately
   - the shared ranking state
   - visible summary stats
6. The next pair appears immediately.

### Simplicity rules

- The voting screen is the primary screen, not a marketing page.
- The interface stays focused on the pair, current progress, and leaderboard context.
- Admin upload is separated from the main voting flow.

## Data Model

### Tables

#### `users`

- `id`
- `username` unique
- `pin_hash`
- `role` enum (`admin`, `user`)
- `created_at`
- `last_active_at`
- `failed_login_count`
- `locked_until`

#### `sessions`

- `id`
- `user_id`
- `token_hash`
- `created_at`
- `expires_at`
- `last_seen_at`
- `ip_hash`

#### `images`

- `id`
- `r2_key_original`
- `r2_key_display`
- `width`
- `height`
- `mime_type`
- `sort_order`
- `status` enum (`active`, `hidden`)
- `uploaded_by`
- `created_at`

#### `vote_events`

- `id`
- `user_id`
- `winner_image_id`
- `loser_image_id`
- `context` enum (`shared_pool_vote`)
- `created_at`

#### `personal_image_state`

- composite key: `user_id`, `image_id`
- `rating`
- `comparisons`
- `wins`
- `losses`
- `confidence`
- `last_compared_at`

#### `shared_image_state`

- `image_id`
- `aggregate_score`
- `rank_position`
- `effective_voter_weight`
- `confidence`
- `updated_at`

#### `user_state`

- `user_id`
- `total_votes_cast`
- `ranking_confidence`
- `recent_pair_cache` nullable serialized field
- `updated_at`

### Notes

- Keep the schema ready for future extension, but do not build a multi-project abstraction into the UX.
- If needed, an internal `collection_id` can be added later with a default single value.

## Ranking Model

### Personal ranking

- Personal ranking is the source of truth for each user's taste profile.
- Each vote updates personal ratings for the winner and loser immediately.
- Use an Elo-style update model first for MVP because it is simple and transparent.
- Reliability/confidence should be derived from vote coverage and comparisons per image, not only from elapsed time.

### Shared ranking

- Shared ranking should not be updated as if every raw vote has equal permanent weight.
- Instead, derive shared ranking from each user's current personal state.

Recommended shared aggregation flow:

1. Compute each user's personal image scores.
2. Normalize them so users with wider or narrower score spreads do not distort the shared model.
3. Assign each user an influence weight that increases with participation and then saturates.
4. Aggregate normalized user scores into one shared score per image.
5. Recompute shared rank order and confidence.

### Influence weighting

The exact curve can be tuned during implementation, but the desired behavior is:

- few votes: low influence
- moderate participation: rapid ramp-up
- enough votes: near-full influence
- heavy over-participation: little additional power

A reasonable first-pass curve is:

`weight = 1 - exp(-votes_cast / threshold)`

Where `threshold` is chosen so a user reaches most of their influence after a modest but meaningful number of votes.

## Pair Selection

Pair selection should use Kura's core idea but apply it per user.

### Goals

- improve each user's personal ranking efficiently
- avoid immediate repeats
- broaden early coverage
- refine near-ties later

### Algorithm

1. Choose an anchor image that the current user has compared the least or has lowest confidence in.
2. If the user's confidence is still low, choose the opponent broadly at random from under-compared images.
3. Once the user's ranking confidence crosses a threshold, choose opponents closer in rating to refine order.
4. Avoid very recent pair repeats using a short recent-pair memory per user.

### Result

- early stage feels broad and exploratory
- later stage feels more refined and useful near the top of the ranking

## Confidence Model

The app should expose confidence in a way users can understand.

For MVP:

- show personal ranking confidence for each user
- show shared ranking confidence for the shared leaderboard

Confidence should be based on:

- image coverage
- total comparisons
- distribution of comparisons across the pool

The Kura reliability formula is a useful reference, but the implementation can simplify it if needed so long as the signal remains stable and interpretable.

## Auth and Abuse Controls

Username plus 4-digit PIN is acceptable only with compensating controls.

Required controls:

- hash PINs with a modern password hasher
- use secure, httpOnly session cookies
- rate limit login, signup, and vote endpoints
- lock accounts temporarily after repeated failed PIN attempts
- add Turnstile to signup and login
- log suspicious auth activity

This should be documented clearly as lightweight gated access, not strong private-data security.

## Image Storage and Delivery

### Storage

- Store originals in R2.
- Generate and store a display-sized derivative for the voting UI.
- Keep buckets private.

### Delivery

Serve images through authenticated application routes so raw object URLs are not the public access model.

For MVP this can be:

- Worker validates session
- Worker fetches object from R2
- Worker returns image response with cache headers appropriate for signed-in use

This keeps access control inside the app even on the free tier.

## Update Model

To minimize cost, avoid paid-style push infrastructure in MVP.

### Behavior

- the voter sees immediate updated personal and shared data in the vote response
- leaderboard pages poll periodically for fresh shared ranking and stats

Polling target:

- every 5 to 10 seconds on leaderboard pages

This is sufficient for 4-6 users and keeps the system simple and cheap.

## API Surface

### Public authenticated endpoints

- `POST /api/signup`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/pair`
- `POST /api/vote`
- `GET /api/leaderboard/shared`
- `GET /api/leaderboard/personal/:username`
- `GET /api/users/:username/stats`
- `GET /api/images/:imageId`

### Admin endpoints

- `POST /api/admin/images/upload`
- `POST /api/admin/images/finalize`
- `PATCH /api/admin/images/:imageId`

## Failure Handling

- If image retrieval fails, skip the image and flag it for admin review.
- If vote processing fails, do not show the next pair until the client receives confirmation.
- If the app reaches free-tier limits, switch UI into read-only mode with a clear banner.
- If periodic polling fails, keep the last known leaderboard and retry with backoff.

## Testing Strategy

### Unit tests

- Elo update math
- influence weighting curve
- shared aggregation
- confidence calculations
- pair selection and repeat avoidance

### Integration tests

- signup and login
- session validation
- vote submission
- shared leaderboard reads
- personal leaderboard reads
- admin upload metadata flow

### End-to-end tests

- signup or login
- load voting page
- submit vote
- verify personal stats update
- verify shared leaderboard eventually refreshes

## Risks

### Weak authentication

Risk:
- username plus 4-digit PIN is guessable

Mitigation:
- Turnstile, rate limiting, lockouts, secure sessions, and small private audience expectations

### Free-tier limits

Risk:
- growth or accidental abuse can exhaust free quotas

Mitigation:
- polling instead of always-on push, image derivatives, caching, indexed queries, low user count

### Aggregation fairness

Risk:
- shared ranking may feel unfair if the influence curve is poorly tuned

Mitigation:
- make weighting configurable in code and validate with seeded fixtures during implementation

### Future migration

Risk:
- D1 and Worker-specific choices may be constraining later

Mitigation:
- keep domain logic isolated from platform bindings and keep SQL/data access behind small adapters

## Implementation Direction After Approval

After this design is reviewed, implementation planning should proceed in this order:

1. project scaffold and deployment target
2. schema and storage model
3. auth and session flow
4. admin upload flow
5. ranking engine and aggregation
6. voting page and polling leaderboards
7. tests and quota-aware hardening
