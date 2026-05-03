import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import ImagePair from "../components/ImagePair";
import {
  ApiError,
  flushQueuedActions,
  getUserLeaderboard,
  logout,
} from "../lib/api";
import {
  applyQueuedAction,
  applyQueuedActions,
  createSkipAction,
  createVoteAction,
  createVoteSession,
  getSpeculativePrefetchImageIds,
  readQueuedActions,
  writeQueuedActions,
  type QueuedAction,
  type VoteSessionState,
} from "../lib/voteSession";
import { preloadImageIds } from "../lib/imagePrep";
import { invalidateVoteAffectedLeaderboardCaches } from "../lib/leaderboardCache";
import { clearCurrentUser, loadCurrentUser, type SessionUser } from "../lib/session";
import { sendQueuedActionsBeacon } from "../lib/voteQueueSync";

const BACKGROUND_FLUSH_INTERVAL_MS = 7_000;
const BACKGROUND_FLUSH_QUEUE_SIZE = 6;

export default function VotePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [session, setSession] = useState<VoteSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<VoteSessionState | null>(null);
  const userRef = useRef<SessionUser | null>(null);
  const queueRef = useRef<QueuedAction[]>([]);
  const flushingRef = useRef(false);
  const exitFlushTriggeredRef = useRef(false);

  const commitSession = useCallback((nextSession: VoteSessionState | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const commitQueuedActions = useCallback((actions: QueuedAction[]) => {
    queueRef.current = actions;

    if (userRef.current) {
      writeQueuedActions(userRef.current.id, actions);
    }
  }, []);

  const flushQueue = useCallback(async (init?: RequestInit) => {
    if (flushingRef.current || queueRef.current.length === 0) {
      return;
    }

    flushingRef.current = true;
    const snapshot = [...queueRef.current];
    let flushedIds: string[] = [];

    try {
      await flushQueuedActions(snapshot, init);
      flushedIds = snapshot.map((action) => action.id);
    } catch {
      // Keep the remaining queue in local storage and retry on the next cycle.
    } finally {
      if (flushedIds.length > 0) {
        commitQueuedActions(
          queueRef.current.filter((action) => !flushedIds.includes(action.id)),
        );

        if (userRef.current) {
          invalidateVoteAffectedLeaderboardCaches(userRef.current.username);
        }
      }

      flushingRef.current = false;

      if (flushedIds.length > 0 && queueRef.current.length > 0) {
        void flushQueue();
      }
    }
  }, [commitQueuedActions]);

  const flushQueueOnExit = useCallback(() => {
    if (exitFlushTriggeredRef.current) {
      return;
    }

    exitFlushTriggeredRef.current = true;
    sendQueuedActionsBeacon(queueRef.current);
    void flushQueue({ keepalive: true });
  }, [flushQueue]);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const nextUser = await loadCurrentUser();
        if (!active) {
          return;
        }

        if (!nextUser) {
          userRef.current = null;
          setUser(null);
          commitSession(null);
          return;
        }

        const leaderboard = await getUserLeaderboard(nextUser.username);
        if (!active) {
          return;
        }

        const queuedActions = readQueuedActions(nextUser.id);
        const nextSession = applyQueuedActions(
          createVoteSession(leaderboard),
          queuedActions,
        );

        userRef.current = nextUser;
        setUser(nextUser);
        commitSession(nextSession);
        commitQueuedActions(queuedActions);
        setError(null);

        if (queuedActions.length > 0) {
          void flushQueue();
        }
      } catch (nextError) {
        if (!active) {
          return;
        }

        if (nextError instanceof ApiError && nextError.status === 401) {
          userRef.current = null;
          setUser(null);
          commitSession(null);
          return;
        }

        setError("Unable to load the next pair");
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [commitQueuedActions, commitSession, flushQueue]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void flushQueue();
    }, BACKGROUND_FLUSH_INTERVAL_MS);
    const handlePageHide = () => {
      flushQueueOnExit();
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("pagehide", handlePageHide);
      flushQueueOnExit();
    };
  }, [flushQueue, flushQueueOnExit]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const imageIds = getSpeculativePrefetchImageIds(session);
    if (imageIds.length === 0) {
      return;
    }

    void preloadImageIds(imageIds).catch(() => undefined);
  }, [session]);

  if (user === undefined) {
    return <main className="page-shell">Loading...</main>;
  }

  if (!user) {
    return <Navigate replace to="/login" />;
  }

  function handleVote(winnerImageId: string, loserImageId: string) {
    if (!sessionRef.current) {
      return;
    }

    setError(null);

    const action = createVoteAction({
      winnerImageId,
      loserImageId,
    });
    const nextSession = applyQueuedAction(sessionRef.current, action);
    const nextQueue = [...queueRef.current, action];

    commitSession(nextSession);
    commitQueuedActions(nextQueue);

    if (nextQueue.length >= BACKGROUND_FLUSH_QUEUE_SIZE) {
      void flushQueue();
    }
  }

  function handleSkip() {
    if (!sessionRef.current?.pair) {
      return;
    }

    setError(null);

    const action = createSkipAction({
      leftImageId: sessionRef.current.pair.left.id,
      rightImageId: sessionRef.current.pair.right.id,
    });
    const nextSession = applyQueuedAction(sessionRef.current, action);
    const nextQueue = [...queueRef.current, action];

    commitSession(nextSession);
    commitQueuedActions(nextQueue);

    if (nextQueue.length >= BACKGROUND_FLUSH_QUEUE_SIZE) {
      void flushQueue();
    }
  }

  async function handleLogout() {
    await flushQueue();
    await logout();
    userRef.current = null;
    commitQueuedActions([]);
    commitSession(null);
    clearCurrentUser();
    navigate("/login", { replace: true });
  }

  return (
    <AppShell
      activeNav="vote"
      onLogout={handleLogout}
      title="Baddest in the game"
      user={user}
    >
        {error ? <p className="form-error">{error}</p> : null}
        <ImagePair
          onChoose={async (winnerImageId, loserImageId) =>
            handleVote(winnerImageId, loserImageId)
          }
          onSkip={async () => handleSkip()}
          pair={session?.pair ?? null}
        />
    </AppShell>
  );
}
