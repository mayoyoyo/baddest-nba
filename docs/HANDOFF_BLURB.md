# Paste this into the new Claude session

---

You're picking up **baddest-nba** — an NBA player headshot ranker (blind 1v1
voting on looks) live at https://baddest.fly.dev. Repo:
https://github.com/mayoyoyo/baddest-nba (public, mine).

**Read these two files first** before doing anything else:

1. `docs/HANDOFF.md` — full project state: stack, engine model, auth model,
   what just shipped, gotchas, my preferences. About a 5-minute read.
2. `docs/2026-05-03-addictiveness-audit.md` — backlog of 18 ranked
   improvements with effort tags. Top 3 are flagged.

**Local dev:** `npm install`, then `npm run dev:server` (API :8080) +
`npm run dev` (Vite :5173) in two terminals. `.env.local` already has
`DATABASE_URL` pointing at Neon.

**Hard rule:** boot the app on localhost and click through any change before
pushing — CI auto-deploys on every push to main, no previews. We got bit by
this on the first deploy.

**My style:** action over discussion. Make reasonable assumptions and ship;
I'll course-correct on the diff. If the change is non-trivial or destructive,
ask first.
