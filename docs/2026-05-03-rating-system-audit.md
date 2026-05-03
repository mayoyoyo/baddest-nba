# Rating System Audit — baddest-nba

**Date:** 2026-05-03
**Context:** ~600 player roster, 4 active voters, ~150 votes each. Dual scoring (per-user Elo + crowd Z-score aggregate). The personal page clusters at 1224±24 (single K-swing); the All-NBA aggregate barely differentiates.

**Critical reframe before reading anything else:** this is **not a skill ranking**. There's no objective "best-looking" player. Every voter is *correct* about their own preferences. Algorithms designed to discover a hidden truth (Glicko-2, TrueSkill, anything that models "true skill" + measurement noise) are imported from chess and Halo where there *is* a ground truth. **We need preference-aggregation algorithms, not skill-discovery algorithms.** Different math, different UX implications.

---

## TL;DR

The 1224-cluster problem isn't a rating-algorithm problem — it's a **data-volume problem with a dual-scoring tax**. Information-theoretically, ranking 600 players needs ~5,300 informative pairwise comparisons. We have 600. We're at 11% of the minimum. No clever algorithm fixes a 9x deficit; only smarter inputs (priors), smarter outputs (aggregation), or smarter pairings (active learning) help.

**If you ship one thing, ship Bayesian smoothing on the crowd score with a popularity-based prior.** It's universal across IMDb, BGG, MAL, Letterboxd; works at any data scale; addresses cold-start and the cluster problem simultaneously; ~30 lines of code plus a one-time prior dataset.

---

## What this is and isn't

| | Skill ranking (chess, Halo) | Preference ranking (us, Hot or Not, Tinder) |
|---|---|---|
| Ground truth | "True skill" exists, hidden | No ground truth — preference *is* the answer |
| Personal rating means | "My current estimate of player X's true skill" | "My personal preference for player X" — definitionally correct |
| Crowd rating means | "Best estimate of true skill, pooled across raters" | "Average preference across the audience" = popularity |
| Disagreement is | Noise to be averaged out | Real signal to be preserved |
| Convergence target | The hidden true value | A stable popularity estimate |
| Volatility (Glicko-2's σ) | Real — players get better/worse | Meaningless — looks don't change session-to-session |
| K-factor decay | Stabilize once estimate is good | Optional — taste doesn't really stabilize |

**Implication:** the right algorithms here are **Bradley-Terry with a Bayesian prior**, **Bayesian-smoothed averages**, and **active learning for pair selection**. Skip Glicko-2's volatility model, skip TrueSkill entirely. The personal Elo we already have is fine *as a personal score* — it's just suffering from data sparsity, which no per-user algorithm can fix.

---

## Diagnosis: why everything looks broken

### Information theory

- 579 players × log₂(579) ≈ **5,300 comparisons** to confidently rank the catalog
- 4 voters × 150 votes = **600 comparisons available** (skips don't count)
- We're at **~11% of the minimum** — the entire roster cannot be confidently ordered with this much data, regardless of math

### Why personal ratings cluster at 1224

A vote at K=48 against an opponent at 1200 yields ±24 exactly. With most players seen exactly once, the personal distribution is degenerate: 1224 (won once), 1200 (never seen / pre-seeded), 1176 (lost once). No clever sort breaks the 1224 cluster because the underlying data has no structure within it.

### Why the crowd score barely differentiates

Current `sharedAggregation.ts` Z-score normalizes each user's ratings before weighted-averaging. With 4 voters, each rating bucket of size ~200 (the 1224 cluster), the normalized contributions all look like ±0 (no spread). Even after I remapped the output to ~1200-base, the underlying values are flat.

### Why "winner stays" doesn't help here

The user proposed king-of-the-hill (winner faces a fresh opponent until they lose). It's intuitive but wrong for this problem:

- It violates Bradley-Terry/Elo independence assumptions (consecutive comparisons share an item, correlated outcomes).
- The defending champ gets `O(streak)` repeated comparisons, biasing their rating-deviation estimate.
- For pure preference (vs skill), it gives you no MORE information than letting users vote on their favorite — Wemby beating 50 strangers is just 50 weak data points about Wemby. Each match is high-prior-on-Wemby low-info.
- **Major consumer ranking apps don't use it.** Kittenwar (the canonical 2006 cute-pic ranker) uses pure random pairing. No public engineering writeup of a winner-stays loop exists.
- The UX intuition behind it (votes feel like they "count") can be addressed with the visible ELO delta we just shipped, no engine change needed.

**Skip winner-stays.**

---

## What similar apps do

### Pure aggregation (no per-user score), at scale

| App | Mechanic | Math |
|---|---|---|
| **Hot or Not** (2000) | Pair vote, single global Elo | Worked because of huge user base |
| **Tinder** (originally) | Pair-based Elo desirability | Quietly replaced ~2019 with a learned recommender |
| **Kittenwar** (2006) | Random pair vote, single global Elo | Random pairing + scale |

These work because of audience size, not because of cleverness. None solves our problem at 4 voters.

### Bayesian-smoothed crowd average (the dominant pattern)

| App | Formula | Notes |
|---|---|---|
| **IMDb** | `WR = (v·R + m·C)/(v+m)`, `m=25,000` | Canonical "weighted rating" |
| **BoardGameGeek** | Same shape, prior count empirically ~1,500–2,000 dummy votes at value 5.5 | Reverse-engineered; BGG won't publish |
| **MyAnimeList** | Same shape, `m=50` | Public formula |
| **Letterboxd** | Bayesian-style shrinkage, formula not published | Behaviorally confirmed: low-N films pull toward 3.0 |

**This pattern is universal because it works.** The math: a player with `n` ratings and observed mean `R` has displayed score `(n·R + m·C) / (n + m)` where `C` is the catalog mean and `m` is a "prior strength" tuning knob. New players sit at `C` (the crowd average); players with `n >> m` votes converge to `R`. There's no cluster problem because the prior is always pulling sparse data back to a sensible default.

### Per-user + crowd pairing (the dual-score pattern)

- **Beli** (restaurants): explicitly 1v1 within-user, dual-score (your prediction + friends' aggregate). No engineering blog. Closest match to our pattern.
- **AniList**: shows two scores (`meanScore` raw, `averageScore` weighted). Acknowledges the difference exists rather than hiding it.
- **Rotten Tomatoes**: critic vs audience, displayed as **two separate numbers, never combined**. People understand two scores fine when they're labeled clearly.
- **Vivino, Untappd**: personal rating displayed prominently; crowd is a single number nearby.

The pattern works *when both numbers are clearly labeled and meaningful*. Currently ours displays "score" on both pages and people can't tell the difference — which is its own bug.

### Pairwise comparison literature

- Random pairing requires Θ(N²) comparisons for full ranking.
- Active selection achieves Θ(N log N) (Negahban-Oh-Shah 2012, Ailon 2011, Heckel et al 2019).
- For N=579 that's **~5,300 vs ~340,000** — the difference between feasible and infeasible at hobby scale.
- Active rule that performs well in practice: **pair items with the most overlap in their current confidence intervals** — those matches give the most information per click.

### Bradley-Terry with Bayesian prior

- Each player has a latent appeal `λᵢ`; `P(i beats j) = λᵢ / (λᵢ + λⱼ)`.
- Standard MLE diverges when the comparison graph is disconnected (which ours definitely is at 600 votes / 579 players).
- Adding a Gaussian prior `log λᵢ ~ N(0, σ²)` makes the posterior strongly convex even with zero comparisons for some items. Items with no votes stay at the prior; items with many votes converge to the data.
- This is **the right tool** for a low-data preference ranker. ~50 lines of code, runs as an offline batch nightly.

---

## Five patterns worth adopting (ranked by leverage)

### 1. Bayesian smoothing with a popularity prior — **ship this first**

**What:** replace the current Z-score weighted mean with `(n·R + m·C) / (n + m)` where:
- `R` = player's mean personal rating across users
- `n` = number of users who've rated them
- `C` = popularity-weighted prior (see below)
- `m` = ~10–20 (so a player's score moves meaningfully after 20+ user-ratings)

**The prior is the magic:** `C` is set per-player from external popularity data — basketball-reference page views, prior season All-NBA voting share, social media follower count, MVP vote share, hand-curated "tier" buckets. A never-voted-on Wemby starts at e.g. 1320 (top tier) instead of 1200 (neutral). Voting then refines from a sensible baseline.

**Why this matters:** addresses the cluster problem AND cold-start AND new-user "the leaderboard is meaningless" simultaneously. With 4 voters the prior dominates; with 100 voters the data dominates. Scales gracefully forever.

**Complexity:** ~30 LOC + a one-time prior dataset (CSV with `player_id, popularity_score`). Hand-curating 600 players is a one-evening job. Or scrape from basketball-reference.

### 2. Bayesian Bradley-Terry for the crowd score — better, but heavier

If smoothing-the-mean doesn't feel granular enough, the next step is full Bayesian Bradley-Terry: instead of averaging users' personal ratings, fit a single global preference model directly on the raw vote events with a Gaussian prior on log-appeal.

**Why it's better:** uses comparison data directly, naturally weights confident comparisons more, gives explicit confidence intervals.

**Why ship #1 first:** BT-MLE is an iterative solver; smoothing is one division. #1 captures 80% of the value at 5% of the effort.

### 3. Active pair selection — gets more bits per vote

Existing engine has the bones (anchor-based, top-10 random pool). Upgrade the scoring function: prefer pairs whose current scores are **closest** (highest match-outcome entropy, most info gained). The math falls out of treating the current rating gap as a Bayesian prior probability.

**Effect at our scale:** 9x improvement in convergence rate per vote. Same vote count, much better ranking quality.

**Cost:** maybe 20 LOC change to `pairing.ts`. The framework is already there.

### 4. Reduce the catalog to top-N popular — pure pragmatism

600 players × 4 voters is fundamentally too sparse. **Cut the active voting pool to top 200 by popularity.** N log N drops from 5,500 to 1,500. Suddenly we're at 40% of theoretical minimum, and within reach of "voted enough to matter."

Hidden players (status='hidden', already supported) become browse-only or simply excluded. Re-introduce them when a player crosses some popularity threshold (rookie of the year, big trade, etc.) via a small admin flow.

**Effect:** turns "the data is impossibly sparse" into "the data is just sparse." Combined with Pattern 1, you get a meaningful leaderboard with current vote volume.

### 5. Drop dual scoring, or commit to it

Current state: personal = raw Elo (1100-1300), crowd = remapped Z-score (1100-1400). Both labeled "score" identically. Users can't tell the difference, and at 4 voters the "crowd" *is* basically the average of 4 personal ratings — there's no extra information justifying the separate surface.

Two clean options:

- **(a) Single hybrid score** = Bayesian-smoothed crowd score everywhere. Personal "favorites" exist as `comparisons >= 1` filter or explicit favorites list, but no per-user numeric score is shown. Simpler product. The All-Stars / 1st Team UX still works — just rank by crowd score filtered to your votes.
- **(b) Explicit dual** = always render `Your: 1248 | Crowd: 1180` side by side on every player. Rotten Tomatoes pattern. Clear, no mystery.

**Recommend (a) until you cross 100 voters.** At 4 voters, your personal taste basically *is* the crowd. The surface dichotomy creates confusion without buying clarity. Re-introduce the dual surface when there's enough voter diversity that the two numbers actually disagree in interesting ways.

---

## Evaluation of the user's other candidate fixes

| Fix | Verdict | Why |
|---|---|---|
| Borda count / pure pairwise | Not better than Bayesian-smoothed mean for this use case. Borda doesn't give you per-player confidence; BT/smoothing does. |
| Glicko-2 / TrueSkill | **Skip.** They model skill, not preference. The volatility/uncertainty machinery is overkill when there's no hidden truth. The "fast initial convergence" benefit is real but a Bayesian prior gives you the same thing more cleanly. |
| Active learning | **Yes (Pattern 3).** Already have anchor-based pairing; upgrade the scoring. |
| Bigger initial K + faster K-decay | Cosmetic. Bigger K = bigger swings = same cluster problem just with higher numbers (1248 cluster instead of 1224). Doesn't add information. |
| Confidence-mismatch pairing | Subset of active learning (Pattern 3). |
| External prior | **Yes (Pattern 1's secret sauce).** Without the external prior, smoothing toward the catalog mean is fine but boring. With one, the leaderboard is meaningful from vote 1. |
| Shorter same-pair cooldown | Don't. Cooldown stays. Repeated same-pair votes don't add meaningful information for preference ranking — you already know what you think. |

---

## Recommended ship order

1. **Hide Josh Oduro.** Already proposed. One SQL update.
2. **Build the popularity prior.** Hand-curate or scrape `data/players-prior.json` mapping `player_id → prior_score`. ~600 entries; one evening.
3. **Bayesian smoothing on the crowd score.** Replace the Z-score aggregator with `(n·R + m·C) / (n + m)` using `C` from the prior. Drop the Z-score remap from the previous commit (it's no longer needed).
4. **Reduce to top 200 active.** Mark the bottom 379 as `status='hidden'` based on popularity threshold. Reversible.
5. **Drop the per-user numeric "rating" surface; keep personal data as filter only.** "Your 1st Team" becomes "your top 5 of the crowd-ranked players you've actually voted on."
6. **Active pair selection upgrade.** Optional, after the above is in.

After this ship, the system is no longer dual-scoring (it's a single popularity-weighted leaderboard with personal filters), the cluster problem is gone (Bayesian smoothing handles sparse data), the cold-start problem is gone (prior gives meaning from vote 1), and the catalog is sized appropriately for the voter base.

---

## Sources

- IMDb weighted rating formula: https://help.imdb.com/article/imdb/track-movies-tv/ratings-faq/G67Y87TFYYP6TWAV
- BoardGameGeek Bayesian average: https://boardgamegeek.com/thread/1567913 ; reverse-engineered prior counts at https://blog.recommend.games/posts/reverse-engineering-boardgamegeek-ranking/
- MAL formula (`m=50`): https://en.wikipedia.org/wiki/MyAnimeList
- Letterboxd weighted rating: https://letterboxd.com/journal/the-score-new-weighted-average-ratings/
- Beli mechanic writeup: https://www.readsnapshots.com/p/beli-food-for-thought
- Tinder Elo replacement: https://www.engadget.com/2019-03-18-tinder-dumps-desirability-scores.html
- Bayesian Bradley-Terry (Caron & Doucet 2012): https://www.stats.ox.ac.uk/~doucet/caron_doucet_bayesianbradleyterry.pdf
- Active pairwise ranking — Rank Centrality (Negahban-Oh-Shah 2012): https://arxiv.org/pdf/1209.1688v1
- Active learning ranking (Ailon 2011/12): https://jmlr.org/papers/v13/ailon12a.html
- Active ranking bounds (Heckel-Shah-Ramchandran-Wainwright 2019): https://projecteuclid.org/journals/annals-of-statistics/volume-47/issue-6/Active-ranking-from-pairwise-comparisons-and-when-parametric-assumptions-do/10.1214/18-AOS1772.pdf
- Wilson lower bound (relevant counterpoint, not adopted): https://www.evanmiller.org/how-not-to-sort-by-average-rating.html
- Bayesian average walk-through: https://arpitbhayani.me/blogs/bayesian-average/
