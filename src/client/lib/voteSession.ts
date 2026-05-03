import type { PairPayload, UserLeaderboardResponse } from "./api";
import { calculateImageConfidence, calculateRankingConfidence } from "../../server/domain/confidence";
import {
  RECENT_PAIR_CACHE_LIMIT,
  selectNextPair,
} from "../../server/domain/pairing";
import { applyEloVote } from "../../server/domain/rating";

const DEFAULT_RATING = 1200;
const QUEUE_STORAGE_PREFIX = "baddest.vote-queue";

export interface VoteSessionImage {
  comparisons: number;
  confidence: number;
  id: string;
  losses: number;
  rating: number;
  wins: number;
}

export interface VoteSessionState {
  images: VoteSessionImage[];
  pair: PairPayload["pair"];
  rankingConfidence: number;
  recentPairs: string[][];
  totalVotesCast: number;
}

export interface QueuedVoteAction {
  createdAt: string;
  id: string;
  kind: "vote";
  loserImageId: string;
  winnerImageId: string;
}

export interface QueuedSkipAction {
  createdAt: string;
  id: string;
  kind: "skip";
  leftImageId: string;
  rightImageId: string;
}

export type QueuedAction = QueuedVoteAction | QueuedSkipAction;

function normalizePair(left: string, right: string): [string, string] {
  return [left, right].sort() as [string, string];
}

function prependRecentPair(
  recentPairs: string[][],
  pair: [string, string],
): string[][] {
  const pairKey = pair.join(":");
  return [
    pair,
    ...recentPairs.filter((recentPair) => recentPair.join(":") !== pairKey),
  ].slice(0, RECENT_PAIR_CACHE_LIMIT);
}

function totalComparisonCounts(images: VoteSessionImage[]): number[] {
  return images.map((image) => image.comparisons);
}

function buildNextPair(
  images: VoteSessionImage[],
  rankingConfidence: number,
  recentPairs: string[][],
  deprioritizedImageIds: string[] = [],
): PairPayload["pair"] {
  const pair = selectNextPair({
    rankingConfidence,
    recentPairs,
    deprioritizedImageIds,
    images: images.map((image) => ({
      imageId: image.id,
      rating: image.rating,
      comparisons: image.comparisons,
      confidence: image.confidence,
    })),
  });

  if (!pair) {
    return null;
  }

  return {
    left: { id: pair[0] },
    right: { id: pair[1] },
  };
}

function isQueuedAction(value: unknown): value is QueuedAction {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<QueuedAction>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.kind !== "string"
  ) {
    return false;
  }

  if (candidate.kind === "vote") {
    return (
      typeof candidate.winnerImageId === "string" &&
      typeof candidate.loserImageId === "string"
    );
  }

  if (candidate.kind === "skip") {
    return (
      typeof candidate.leftImageId === "string" &&
      typeof candidate.rightImageId === "string"
    );
  }

  return false;
}

function queueStorageKey(userId: string): string {
  return `${QUEUE_STORAGE_PREFIX}:${userId}`;
}

export function createVoteAction(input: {
  loserImageId: string;
  winnerImageId: string;
}): QueuedVoteAction {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: "vote",
    loserImageId: input.loserImageId,
    winnerImageId: input.winnerImageId,
  };
}

export function createSkipAction(input: {
  leftImageId: string;
  rightImageId: string;
}): QueuedSkipAction {
  const [leftImageId, rightImageId] = normalizePair(
    input.leftImageId,
    input.rightImageId,
  );

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: "skip",
    leftImageId,
    rightImageId,
  };
}

export function createVoteSession(
  leaderboard: UserLeaderboardResponse,
): VoteSessionState {
  const images = leaderboard.leaderboard.map((row) => ({
    id: row.image.id,
    rating: row.rating ?? DEFAULT_RATING,
    comparisons: row.comparisons,
    wins: row.wins,
    losses: row.losses,
    confidence: row.confidence,
  }));
  const rankingConfidence = leaderboard.summary.rankingConfidence ?? 0;
  const recentPairs: string[][] = [];

  return {
    images,
    rankingConfidence,
    recentPairs,
    totalVotesCast: leaderboard.summary.totalVotesCast ?? 0,
    pair: buildNextPair(images, rankingConfidence, recentPairs),
  };
}

export function applyQueuedAction(
  session: VoteSessionState,
  action: QueuedAction,
): VoteSessionState {
  if (action.kind === "skip") {
    const recentPairs = prependRecentPair(
      session.recentPairs,
      normalizePair(action.leftImageId, action.rightImageId),
    );

    return {
      ...session,
      recentPairs,
      pair: buildNextPair(
        session.images,
        session.rankingConfidence,
        recentPairs,
        [...new Set(recentPairs.flat())],
      ),
    };
  }

  const images = session.images.map((image) => ({ ...image }));
  const winner = images.find((image) => image.id === action.winnerImageId);
  const loser = images.find((image) => image.id === action.loserImageId);

  if (!winner || !loser) {
    return session;
  }

  const nextRatings = applyEloVote({
    winner: winner.rating,
    loser: loser.rating,
  });

  winner.rating = nextRatings.winner;
  winner.comparisons += 1;
  winner.wins += 1;

  loser.rating = nextRatings.loser;
  loser.comparisons += 1;
  loser.losses += 1;

  const comparisonCounts = totalComparisonCounts(images);
  const averageComparisons =
    comparisonCounts.reduce((sum, count) => sum + count, 0) /
    Math.max(images.length, 1);

  winner.confidence = calculateImageConfidence({
    comparisons: winner.comparisons,
    poolAverageComparisons: averageComparisons,
  });
  loser.confidence = calculateImageConfidence({
    comparisons: loser.comparisons,
    poolAverageComparisons: averageComparisons,
  });

  const rankingConfidence = calculateRankingConfidence({
    totalImages: images.length,
    comparisonCounts,
  });
  const recentPairs = prependRecentPair(
    session.recentPairs,
    normalizePair(action.winnerImageId, action.loserImageId),
  );

  return {
    images,
    rankingConfidence,
    recentPairs,
    totalVotesCast: session.totalVotesCast + 1,
    pair: buildNextPair(images, rankingConfidence, recentPairs),
  };
}

export function applyQueuedActions(
  session: VoteSessionState,
  actions: QueuedAction[],
): VoteSessionState {
  return actions.reduce(
    (nextSession, action) => applyQueuedAction(nextSession, action),
    session,
  );
}

export function getSpeculativePrefetchImageIds(
  session: VoteSessionState | null,
): string[] {
  if (!session?.pair) {
    return [];
  }

  const currentImageIds = new Set([
    session.pair.left.id,
    session.pair.right.id,
  ]);
  const outcomes = [
    applyQueuedAction(
      session,
      createVoteAction({
        winnerImageId: session.pair.left.id,
        loserImageId: session.pair.right.id,
      }),
    ),
    applyQueuedAction(
      session,
      createVoteAction({
        winnerImageId: session.pair.right.id,
        loserImageId: session.pair.left.id,
      }),
    ),
    applyQueuedAction(
      session,
      createSkipAction({
        leftImageId: session.pair.left.id,
        rightImageId: session.pair.right.id,
      }),
    ),
  ];

  const nextImageIds = new Set<string>();

  for (const outcome of outcomes) {
    if (!outcome.pair) {
      continue;
    }

    for (const imageId of [outcome.pair.left.id, outcome.pair.right.id]) {
      if (!currentImageIds.has(imageId)) {
        nextImageIds.add(imageId);
      }
    }
  }

  return [...nextImageIds];
}

export function readQueuedActions(userId: string): QueuedAction[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(queueStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isQueuedAction);
  } catch {
    return [];
  }
}

export function writeQueuedActions(
  userId: string,
  actions: QueuedAction[],
): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  if (actions.length === 0) {
    window.localStorage.removeItem(queueStorageKey(userId));
    return;
  }

  window.localStorage.setItem(queueStorageKey(userId), JSON.stringify(actions));
}
