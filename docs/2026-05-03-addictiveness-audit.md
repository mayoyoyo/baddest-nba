# Addictiveness Audit — baddest-nba

**Date:** 2026-05-03
**Context:** Live at https://baddest.fly.dev. Current state: blind 1v1 voting, ELO engine with dynamic K, guest mode, mobile-first shadcn UI, top-3 leaderboard with paywall, avatar evolution at 10 votes, light/dark, 60s leaderboard cache.

What follows is a punch list of concrete improvements ordered by my best read on impact-per-effort. Each note is independent — pick and choose. Effort tags: **S** = under an hour, **M** = 2–4 hours, **L** = a full day or more.

---

## 1. Reframe W/L away from "wins/losses" — it's misleading

**Observation.** Right now `/me` shows each player's W/L in your personal rankings. The pairing engine deliberately gives players unequal exposure (anchor needs vs deprioritization), so a player with 8W-1L might just be the one you keep seeing against weaker opponents, while a 30W-30L player is actually harder to compare. The number is statistically noisy and the user instinct ("more wins = better") doesn't hold.

**Recommendation.** Drop W/L from `/me`. Replace with two stats per player: **rating** (the ELO number, which already accounts for opponent strength) and **votes** (raw comparison count, signaling confidence in their rating). Optionally add a **"crowd agreement"** stat: % of your votes where your pick is also the global higher-ranked player. That's the real "are you a good judge" metric.

**Why.** ELO already encodes the meaning W/L pretends to. Showing both is redundant and the W/L number is the misleading half.

**Effort.** S — copy change in `MePage.tsx` + (optionally) one new derived field in `/api/me/leaderboard`.

---

## 2. Daily streak + "Vote of the Day" carousel

**Observation.** No reason to come back tomorrow. Once you've voted a few rounds today, the loop is identical tomorrow.

**Recommendation.** Server picks **3 hand-curated daily matchups** at midnight UTC (could be top-vs-top, rookie-vs-vet, same-team duel, etc.). Frontend gates these as "Today's lineup" before the open queue starts. A small streak counter ("🔥 7-day streak — vote today's 3 to keep it") lives in the header. Streak resets if you skip a day; one-day "freeze" available after 7 days.

**Why.** Streaks are the single highest-impact retention pattern in 2026 mobile data — apps with streak mechanics see ~50% longer median engagement. Streak freeze adds another 50% on top by softening the loss aversion. ([Trophy.so streak study](https://trophy.so/blog/mobile-app-engagement-strategies))

**Effort.** L — needs a daily-matchup picker on the server, a UI surface, and streak persistence on `users` (or a new `user_streaks` table).

---

## 3. Show ELO delta per vote (post-vote, fast)

**Observation.** The matchup is blind, but after a vote the user gets nothing — just the next pair. The "I made that happen" feedback loop is missing.

**Recommendation.** When the vote response returns, briefly overlay `+8` on the winner card and `-6` on the loser before they slide off. Use the engine's actual delta. Reveal the names too (since the choice has been made, name reveal doesn't bias the next vote). 800ms total, then next pair.

**Why.** This is the variable-reward dopamine that ELO games (chess, ranked LoL/Valorant) live on — the exact payout is unknown until it lands, and that uncertainty is the hook. Showing names post-vote also turns each round into a tiny "wait, that was Wemby?" moment.

**Effort.** M — extend the vote response with `delta: { winner, loser }` + `winnerPlayer`, `loserPlayer`; add a 600ms reveal animation in `VotePage`.

---

## 4. Personal vs Crowd "agreement" overlay on the personal leaderboard

**Observation.** `/me` shows your top 10 in isolation. There's no signal of whether your taste is mainstream or contrarian — which is the actually interesting personal stat.

**Recommendation.** Next to each player on `/me`, show the gap between your rank and the global rank: **"Your #1 — global #14 (+13)"** with green/red/grey color. Aggregate stat at the top: **"You're 73% in line with the crowd"** (% of personal top-50 that's in global top-50, or a Spearman correlation).

**Why.** People love finding out where they're a contrarian. This makes the personal page sticky in a way pure rankings never are. Also gives shareable bragging rights: "I'm the only one who has Bam in the top 10."

**Effort.** M — `/me/leaderboard` already has personal data; add the global ranks (already cached) in the same response and compute the gap client-side.

---

## 5. Sub-15-second onboarding: vote first, name yourself never

**Observation.** A guest can vote without signup, which is great. But the `/me` page nudges signup hard — and the avatar-reveal at 10 votes is the only built-in moment of delight before that.

**Recommendation.** Add **two earlier aha moments**:
- **At 3 votes**: a tiny celebration card slides in — "Your taste is forming. Top pick so far: [player photo + name]." Doesn't gate anything. Establishes that the app remembers.
- **At 10 votes**: the existing avatar transformation, kept.
- **At 25 votes**: the existing personal top-10 unlocks (already there indirectly via `/me`), and a prompt: "You've ranked 25 — see how you stack up?" → links to `/me`.

**Why.** "Identify ONE aha moment and design toward it" is the canonical 2026 advice — but for a vote-and-go app, multiple small aha moments at vote-count milestones beat one big one. The first 3 minutes are when 90% of churn happens. ([Chameleon, Productled](https://www.chameleon.io/blog/successful-user-onboarding))

**Effort.** S–M — server already returns `totalVotesCast`; add a small `MilestoneToast` component triggered client-side when crossing thresholds.

---

## 6. "Rare matchup" badge on certain pairs

**Observation.** Every pair feels equally weighted. There's no surprise.

**Recommendation.** When a matchup is genuinely rare (e.g., total comparisons in the system < 5 between these two), surface a small **"Rare matchup ⚡"** badge. Same idea as Pokémon Go's shiny encounter — the moment-to-moment gameplay didn't change, but ONE in fifty pulls feels special and makes you want to keep playing.

**Why.** Variable reward magnitude > variable reward frequency. You don't need to *give* anything — just *signal* that this round is different.

**Effort.** M — server returns `rare: true` on the pair response when both images have global comparisons < some_threshold; client renders a 24px ribbon.

---

## 7. Tournament/bracket mode — weekly 16-man knockout

**Observation.** Pure 1v1 voting on the open pool is great for ranking but flat for storytelling. There's no climax.

**Recommendation.** Once a week, a **"Friday Bracket"**: server picks 16 players (current top 16 by global ELO, or themed — "Rookies of '26", "The 2003 Draft Class", etc.) and serves them as a single-elimination bracket. The user makes 15 picks. Their bracket is saved; on Sunday, the global winner is announced from aggregated picks. Streaks-eligible.

**Why.** Brackets are the most-shared UGC format on sports Twitter (March Madness alone). Adding a weekly cadence creates a Friday→Sunday session window that can be promoted via a single notification. ESPN's tournament app proves the format works on phones if you collapse it to one-matchup-at-a-time. ([NHL Bracket Challenge case study](https://www.gregpodunovich.com/project-nhl-bracket-challenge))

**Effort.** L — new `tournaments` + `tournament_picks` tables, weekly cron (Fly cron via separate machine or scheduled `flyctl deploy` workflow), bracket UI (vertical-stack one-matchup-per-card pattern, not the standard wide bracket).

---

## 8. Shareable "this week's taste" card

**Observation.** Zero virality surface. There's no way for a user to publish their top 3 anywhere outside the app.

**Recommendation.** A **"Share my taste"** button on `/me` that generates a square 1080×1080 PNG: dark gradient, three player headshots stacked with names + ranks, your username + total vote count, and a small `baddest.fly.dev` watermark. Opens the native share sheet on mobile.

**Why.** Dunked-on, controversial player rankings are catnip for sports Twitter/IG stories. One viral share = potentially hundreds of new visitors (who land on a public top-3 leaderboard, vote a bit, hit the paywall, sign up). This is the cheapest user acquisition lever you have.

**Effort.** M — server endpoint that renders the PNG via `@vercel/og` or `satori` (or generate client-side via a hidden canvas). Native share API is already supported on iOS/Android web.

---

## 9. Live "voting now" pulse

**Observation.** The site feels static — no sense that other people are using it right now.

**Recommendation.** A small ambient pulse on the Vote page: **"●  127 votes in the last hour"**, updated every 30s via a cheap `/api/pulse` endpoint that returns `{ recentVotes: number, livePlayers: number }`. The dot animates. No user info revealed.

**Why.** Social proof without any community-management burden. The number doesn't even need to be huge — "23 votes in the last hour" still beats "you're alone here". Twitch's stream viewer count works on the same principle.

**Effort.** S — one count query (`SELECT count(*) FROM vote_events WHERE created_at > now() - interval '1 hour'`) cached for 30s, one tiny client component.

---

## 10. Photos: pre-fetch the next pair

**Observation.** Each new pair triggers two ~50KB image loads from `cdn.nba.com`. On slow connections you see the muted background flash.

**Recommendation.** When the vote response returns the next pair, **start downloading those images immediately** in the background while the current animation runs. By the time the cards swap, both images are warm in the browser cache. Use `<link rel="prefetch">` injected per pair, or a hidden `Image()` ping.

**Why.** Tinder, Hinge, and Bumble all do this. The reason it feels good is that images "just appear" rather than fade in. Tiny perceived-perf win that compounds across hundreds of votes per session.

**Effort.** S — 10 lines in `VotePage.tsx`: when `pair` updates, also call `new Image(); img.src = ...` on the next-pair URLs.

---

## 11. Move the leaderboard cache to a longer TTL + shorter stale window

**Observation.** Cache TTL is 60s and we invalidate explicitly on every vote. With many concurrent voters, that means most votes still trigger a recompute. Also, cold reads are ~900ms which IS the reason for caching — any time the cache misses (post-vote or after expiry), the user pays the cost.

**Recommendation.** Switch to **stale-while-revalidate**: serve the cached value immediately even if it's up to 5 minutes stale, and trigger a background refresh if `age > 60s`. Drop the explicit invalidation on vote — let TTL handle it. The user who just voted sees their personal `/me` reflect the change instantly anyway; the global leaderboard being 60–300s behind is invisible.

**Why.** 1 user voting shouldn't penalize the next 5 readers. SWR is the standard pattern for this exact tradeoff.

**Effort.** S–M — extend `leaderboardCache.ts` with `swrTTL`, fire-and-forget recompute when stale.

---

## 12. Position-based and team-based leaderboard tabs

**Observation.** The single global leaderboard hides interesting sub-rankings. "Best-looking center" or "baddest Laker" is a much stickier read than "rank #47 overall".

**Recommendation.** Add tabs on `/leaderboard`: **All / Position (G/F/C) / Team**. Server already has `pos` and `team` on every player; the aggregate already knows player metadata. Show top 10 per category.

**Why.** Multiplies the number of "winners" the app can crown. Also creates more share-worthy slices ("My #1 power forward is a hot take"). Requires zero new data.

**Effort.** M — leaderboard service grows a `groupBy?: "pos" | "team"` param; UI gets a tab strip.

---

## 13. Notification primer: ask AT THE PROMOTION MOMENT, not on first visit

**Observation.** No web push today. When you do add it, the wrong move is to prompt on first page load (high refusal rate).

**Recommendation.** Trigger the browser push permission prompt **inside the post-promotion success screen**, with an explicit value prop: *"Get a ping when there's a new daily lineup. One notification a day, that's it."* User just made a commitment (signup) so they're primed to say yes.

**Why.** Personalized push lifts D7 retention up to 14%, but only if you don't blow the permission grant on a cold prompt. Asking inside a moment of buy-in roughly doubles grant rate. ([OneSignal 2026 retention](https://onesignal.com/blog/how-leading-mobile-teams-are-rethinking-retention-for-2026/))

**Effort.** M (later) — out of scope until #2 (daily streak) is shipped, since you need a *reason* to notify before you notify.

---

## 14. "Climbing fast" callout on the leaderboard

**Observation.** The leaderboard is a static snapshot. Nothing tells you who's surging.

**Recommendation.** Compute a daily delta in `aggregate_score` (or `rank_position`) per player. Show a green ▲ next to anyone who jumped 5+ ranks in the last 24h, red ▼ for big drops. A small "📈 Trending" shelf above the main list shows the top 3 climbers.

**Why.** Movement > magnitude for engagement. People come back to see what changed, not to confirm the same thing they saw yesterday. Same reason Hacker News leans on the "front page" delta.

**Effort.** M — needs a daily snapshot table (`shared_image_state_history` row per day), computed in a nightly job. The job can be a simple `flyctl machine run` cron from GitHub Actions.

---

## 15. Two-bar header on `/me`: rating distribution

**Observation.** `/me` shows a flat list. There's no shape to it.

**Recommendation.** A small 80px-tall histogram at the top of `/me`: x-axis is rating bucket (1000–1400 in 50pt bins), y-axis is count. Highlight the bucket containing your top player. One look tells the user: "I'm picky" (long thin tail at the top) vs "I love everyone" (compressed cluster).

**Why.** Self-knowledge as a feature. Spotify Wrapped works because people want a snapshot of "their taste." This is a mini Wrapped that updates live.

**Effort.** M — one chart component; the data is already in `/me/leaderboard`.

---

## 16. Save the "I picked early" badge on bracket-style accuracy

**Observation.** No persistent recognition for being a good early picker.

**Recommendation.** When a player crosses into the global top 10 for the first time, retroactively check who had them in their personal top 10 *before* the move. Award a small in-app badge: **"Called it early — Wemby (#1 → #1, you saw it at vote 14)."** Show the badge collection on `/me`.

**Why.** This is exactly the "I bought before everyone else" dopamine that crypto and stocks-discord run on. It's free to implement (the data is in vote_events ordering) and creates a long-term collection mechanic.

**Effort.** M — requires a `badges` table + a nightly job that scans for new global top-10 entries and crosschecks personal rankings at the time of those votes. The retroactive lookup is the hard part — easier to compute it forward-looking only.

---

## 17. Compress the avatar reveal into the in-app moment, not behind /me

**Observation.** The avatar evolves at 10 votes, but you only notice on the next page navigation (or if you're looking at the header at the right moment).

**Recommendation.** When the vote that crosses the 10-threshold is cast, show a **brief full-screen takeover** (300ms): the basketball emoji animates up, dissolves, the new player headshot fades in, caption: "Meet your taste." Then dismiss back to the next pair.

**Why.** The current implementation has the moment but doesn't *celebrate* it. Identity-based moments deserve dramatic delivery — that's literally the entire pitch of avatar/customization in games.

**Effort.** S — vote response can include a `milestone: "avatar_unlocked"` flag when crossing 10, client renders a 300ms overlay.

---

## 18. Ditch the `/api/health` 404 favicon noise

**Observation.** Browser console shows `GET /favicon.ico → 404` on every page load. Cosmetic but unprofessional.

**Recommendation.** Add a 32×32 favicon (basketball emoji rendered to PNG, or a single-letter monogram in your brand color). Drop it at `public/favicon.ico` and reference it in `index.html`. Vite copies `public/` into the build automatically.

**Why.** It's free polish. Anyone who opens DevTools sees this and silently downgrades you.

**Effort.** S — generate a PNG, write one HTML line.

---

## Notes that DIDN'T make the cut (and why)

- **Live chat / comments per matchup** — community moderation overhead is too high for a hobby project; ratio of value to ongoing-attention is bad.
- **Following other users** — needs a critical mass of users to matter; premature.
- **Player profile pages** — pulls focus away from the matchup loop, which is the engine of the whole site.
- **Predictive ML / "you might like X"** — ELO already does this implicitly; explicit recommendations add complexity without clear lift on a 579-item catalog.
- **Skill-adjusted ELO** ("baddest 6th man", "baddest under 6'2") — interesting but data is incomplete (we'd need to enrich `players.json` with height/role) and slices the audience too thin.
- **Push notifications without a streak/daily hook** — see #13. Ship #2 first.
- **A/B testing infrastructure** — no traffic to A/B against yet.

---

## My subjective top 3 to ship next

1. **#1 (drop W/L)** — costs nothing, fixes a meaningful UX confusion you already flagged.
2. **#3 (ELO delta + name reveal post-vote)** — biggest moment-to-moment delight upgrade.
3. **#9 (live "voting now" pulse)** — single cheap query, immediately makes the site feel alive.

After those three, the daily streak (#2) is the move that determines whether anyone comes back tomorrow.

---

## Sources

- [Trophy.so — mobile app engagement strategies](https://trophy.so/blog/mobile-app-engagement-strategies)
- [OneSignal — how leading mobile teams are rethinking retention 2026](https://onesignal.com/blog/how-leading-mobile-teams-are-rethinking-retention-for-2026/)
- [Adapty — 15 strategies to increase app engagement 2026](https://adapty.io/blog/how-to-increase-app-engagement/)
- [Productled — Aha moments in onboarding](https://productled.com/blog/how-to-use-aha-moments-to-drive-onboarding-success)
- [Chameleon — successful user onboarding](https://www.chameleon.io/blog/successful-user-onboarding)
- [LearnClash — ELO rating system, variable rewards](https://learnclash.com/blog/elo-rating-system)
- [Greg Podunovich — NHL Bracket Challenge mobile case study](https://www.gregpodunovich.com/project-nhl-bracket-challenge)
- [BracketsNinja — prediction bracket challenges](https://www.bracketsninja.com/blog/how-to-create-prediction-bracket)
- [ESPN press release — Tournament Challenge 2026](https://espnpressroom.com/us/press-releases/2026/03/espn-tournament-challenge-returns-with-new-eliminator-game-deeper-app-integration-and-enhanced-tools-for-mens-and-womens-tournaments/)
