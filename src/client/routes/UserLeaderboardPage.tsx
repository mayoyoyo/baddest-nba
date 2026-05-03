import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import ConfidenceBadge from "../components/ConfidenceBadge";
import LeaderboardTable from "../components/LeaderboardTable";
import { ApiError, getUserLeaderboard } from "../lib/api";
import {
  invalidateVoteAffectedLeaderboardCaches,
  LEADERBOARD_POLL_INTERVAL_MS,
  readLeaderboardCache,
  shouldRefreshLeaderboardCache,
  USER_LEADERBOARD_CACHE_TTL_MS,
  userLeaderboardCacheKey,
  writeLeaderboardCache,
} from "../lib/leaderboardCache";
import { startPolling } from "../lib/polling";
import { loadCurrentUser, type SessionUser } from "../lib/session";
import { useAppLogout } from "../lib/useAppLogout";
import { flushStoredQueuedActions } from "../lib/voteQueueSync";

export default function UserLeaderboardPage() {
  const params = useParams();
  const username = params.username ?? "";
  const [viewer, setViewer] = useState<SessionUser | null | undefined>(undefined);
  const [title, setTitle] = useState(username);
  const [summary, setSummary] = useState<{
    rankingConfidence: number;
    totalVotesCast: number;
  } | null>(null);
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
        const nextViewer = await loadCurrentUser();

        if (!active) {
          return;
        }

        if (!nextViewer) {
          setViewer(null);
          return;
        }

        const flushedCount = await flushStoredQueuedActions(nextViewer.id);
        if (flushedCount > 0) {
          invalidateVoteAffectedLeaderboardCaches(nextViewer.username);
        }

        const cacheEntry = readLeaderboardCache<{
          rows: Array<{
            confidence: number;
            image: { id: string };
            rankPosition: number;
            score: string;
            wins: number;
          }>;
          summary: {
            rankingConfidence: number;
            totalVotesCast: number;
          };
          title: string;
        }>(userLeaderboardCacheKey(username));

        setViewer(nextViewer);

        if (cacheEntry) {
          hadCachedRows = true;
          setTitle(cacheEntry.data.title);
          setSummary(cacheEntry.data.summary);
          setRows(cacheEntry.data.rows);
          setError(null);
        }

        if (
          !shouldRefreshLeaderboardCache(
            cacheEntry,
            USER_LEADERBOARD_CACHE_TTL_MS,
          )
        ) {
          return;
        }

        const leaderboard = await getUserLeaderboard(username);

        if (!active) {
          return;
        }

        const nextRows = leaderboard.leaderboard.map((row) => ({
          image: row.image,
          rankPosition: row.rankPosition,
          confidence: row.confidence,
          score: row.rating.toFixed(1),
          wins: row.wins,
        }));

        setTitle(leaderboard.user.username);
        setSummary(leaderboard.summary);
        setRows(nextRows);
        setError(null);
        writeLeaderboardCache(userLeaderboardCacheKey(username), {
          rows: nextRows,
          summary: leaderboard.summary,
          title: leaderboard.user.username,
        });
      } catch (nextError) {
        if (!active) {
          return;
        }

        if (nextError instanceof ApiError && nextError.status === 401) {
          setViewer(null);
          return;
        }

        if (hadCachedRows) {
          return;
        }

        setError("Unable to load this leaderboard");
      }
    }

    void loadPage();
    const stopPolling = startPolling(loadPage, LEADERBOARD_POLL_INTERVAL_MS);

    return () => {
      active = false;
      stopPolling();
    };
  }, [username]);

  if (viewer === undefined) {
    return <main className="page-shell">Loading...</main>;
  }

  if (!viewer) {
    return <Navigate replace to="/login" />;
  }

  return (
    <AppShell
      activeNav={viewer.username === username ? "your" : "people"}
      onLogout={handleLogout}
      title={title}
      user={viewer}
    >
      {summary ? (
        <div className="summary-grid">
          <div className="summary-card">
            <span>Total votes</span>
            <strong>{summary.totalVotesCast}</strong>
          </div>
          <div className="summary-card">
            <span>Ranking confidence</span>
            <strong>
              <ConfidenceBadge value={summary.rankingConfidence} />
            </strong>
          </div>
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <LeaderboardTable rows={rows} />
    </AppShell>
  );
}
