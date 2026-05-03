import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import ConfidenceBadge from "../components/ConfidenceBadge";
import { ApiError, getPeople } from "../lib/api";
import {
  invalidateVoteAffectedLeaderboardCaches,
  LEADERBOARD_POLL_INTERVAL_MS,
  peopleCacheKey,
  PEOPLE_CACHE_TTL_MS,
  readLeaderboardCache,
  shouldRefreshLeaderboardCache,
  writeLeaderboardCache,
} from "../lib/leaderboardCache";
import { startPolling } from "../lib/polling";
import { loadCurrentUser, type SessionUser } from "../lib/session";
import { useAppLogout } from "../lib/useAppLogout";
import { flushStoredQueuedActions } from "../lib/voteQueueSync";

export default function PeoplePage() {
  const [viewer, setViewer] = useState<SessionUser | null | undefined>(undefined);
  const [people, setPeople] = useState<
    Array<{
      summary: {
        rankingConfidence: number;
        totalVotesCast: number;
      };
      username: string;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const handleLogout = useAppLogout();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function loadPage() {
      let hadCachedPeople = false;

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
          users: Array<{
            summary: {
              rankingConfidence: number;
              totalVotesCast: number;
            };
            username: string;
          }>;
        }>(peopleCacheKey());

        setViewer(nextViewer);

        if (cacheEntry) {
          hadCachedPeople = true;
          setPeople(cacheEntry.data.users);
          setError(null);
        }

        if (!shouldRefreshLeaderboardCache(cacheEntry, PEOPLE_CACHE_TTL_MS)) {
          return;
        }

        const response = await getPeople();

        if (!active) {
          return;
        }

        setViewer(nextViewer);
        setPeople(response.users);
        setError(null);
        writeLeaderboardCache(peopleCacheKey(), {
          users: response.users,
        });
      } catch (nextError) {
        if (!active) {
          return;
        }

        if (nextError instanceof ApiError && nextError.status === 401) {
          setViewer(null);
          return;
        }

        if (hadCachedPeople) {
          return;
        }

        setError("Unable to load people");
      }
    }

    void loadPage();
    const stopPolling = startPolling(loadPage, LEADERBOARD_POLL_INTERVAL_MS);

    return () => {
      active = false;
      stopPolling();
    };
  }, []);

  if (viewer === undefined) {
    return <main className="page-shell">Loading...</main>;
  }

  if (!viewer) {
    return <Navigate replace to="/login" />;
  }

  return (
    <AppShell
      activeNav="people"
      onLogout={handleLogout}
      title="People"
      user={viewer}
    >
      {error ? <p className="form-error">{error}</p> : null}
      <div className="table-wrap">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Total votes</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr
                className="leaderboard-table__row-link"
                key={person.username}
                onClick={() => navigate(`/users/${person.username}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/users/${person.username}`);
                  }
                }}
                role="link"
                tabIndex={0}
              >
                <td>{person.username}</td>
                <td>{person.summary.totalVotesCast}</td>
                <td>
                  <ConfidenceBadge value={person.summary.rankingConfidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
