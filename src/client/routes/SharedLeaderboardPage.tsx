import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import LeaderboardTable from "../components/LeaderboardTable";
import { ApiError, getSharedLeaderboard } from "../lib/api";
import {
  invalidateVoteAffectedLeaderboardCaches,
  LEADERBOARD_POLL_INTERVAL_MS,
  readLeaderboardCache,
  SHARED_LEADERBOARD_CACHE_TTL_MS,
  sharedLeaderboardCacheKey,
  shouldRefreshLeaderboardCache,
  writeLeaderboardCache,
} from "../lib/leaderboardCache";
import { startPolling } from "../lib/polling";
import { loadCurrentUser, type SessionUser } from "../lib/session";
import { useAppLogout } from "../lib/useAppLogout";
import { flushStoredQueuedActions } from "../lib/voteQueueSync";

export default function SharedLeaderboardPage() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [rows, setRows] = useState<
    Array<{
      confidence: number;
      image: { id: string };
      rankPosition: number;
      score: string;
      wins: number;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const handleLogout = useAppLogout();

  useEffect(() => {
    let active = true;

    async function loadPage() {
      let hadCachedRows = false;

      try {
        const nextUser = await loadCurrentUser();

        if (!active) {
          return;
        }

        if (!nextUser) {
          setUser(null);
          return;
        }

        const flushedCount = await flushStoredQueuedActions(nextUser.id);
        if (flushedCount > 0) {
          invalidateVoteAffectedLeaderboardCaches(nextUser.username);
        }

        const cacheEntry = readLeaderboardCache<{
          rows: Array<{
            confidence: number;
            image: { id: string };
            rankPosition: number;
            score: string;
            wins: number;
          }>;
        }>(sharedLeaderboardCacheKey());

        setUser(nextUser);

        if (cacheEntry) {
          hadCachedRows = true;
          setRows(cacheEntry.data.rows);
          setError(null);
        }

        if (
          !shouldRefreshLeaderboardCache(
            cacheEntry,
            SHARED_LEADERBOARD_CACHE_TTL_MS,
          )
        ) {
          return;
        }

        const leaderboard = await getSharedLeaderboard();

        if (!active) {
          return;
        }

        const nextRows = leaderboard.leaderboard.map((row) => ({
          image: row.image,
          rankPosition: row.rankPosition,
          confidence: row.confidence,
          score: row.aggregateScore.toFixed(2),
          wins: row.wins,
        }));

        setRows(nextRows);
        setError(null);
        writeLeaderboardCache(sharedLeaderboardCacheKey(), {
          rows: nextRows,
        });
      } catch (nextError) {
        if (!active) {
          return;
        }

        if (nextError instanceof ApiError && nextError.status === 401) {
          setUser(null);
          return;
        }

        if (hadCachedRows) {
          return;
        }

        setError("Unable to load the shared leaderboard");
      }
    }

    void loadPage();
    const stopPolling = startPolling(loadPage, LEADERBOARD_POLL_INTERVAL_MS);

    return () => {
      active = false;
      stopPolling();
    };
  }, []);

  if (user === undefined) {
    return <main className="page-shell">Loading...</main>;
  }

  if (!user) {
    return <Navigate replace to="/login" />;
  }

  return (
    <AppShell
      activeNav="shared"
      onLogout={handleLogout}
      title="Shared leaderboard"
      user={user}
    >
      {error ? <p className="form-error">{error}</p> : null}
      <LeaderboardTable rows={rows} />
    </AppShell>
  );
}
