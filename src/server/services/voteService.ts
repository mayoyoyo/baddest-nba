import { calculateImageConfidence, calculateRankingConfidence } from "../domain/confidence.js";
import { RECENT_PAIR_CACHE_LIMIT, selectNextPair } from "../domain/pairing.js";
import { applyEloTie, applyEloVote } from "../domain/rating.js";
import { toDbClient, type DatabaseLike } from "../lib/db.js";
import { invalidateSharedLeaderboardCache } from "./leaderboardCache.js";
import { getImageById, listActiveImages, type ImageRow } from "../repositories/imagesRepo.js";
import {
  getUserState,
  upsertPersonalImageState,
  upsertUserState,
  listPersonalImageState,
  type PersonalImageStateRow,
} from "../repositories/leaderboardsRepo.js";
import { createVoteEvent, getVoteEventById } from "../repositories/votesRepo.js";

const DEFAULT_RATING = 1200;
interface VoteInput {
  actionId?: string;
  loserImageId: string;
  winnerImageId: string;
}

interface SkipInput {
  leftImageId: string;
  rightImageId: string;
}

export interface FlushActionVoteInput {
  id: string;
  kind: "vote";
  loserImageId: string;
  winnerImageId: string;
}

export interface FlushActionSkipInput {
  id: string;
  kind: "skip";
  leftImageId: string;
  rightImageId: string;
}

export type FlushActionInput = FlushActionVoteInput | FlushActionSkipInput;

interface PairResponseImage {
  id: string;
}

export interface PairResponse {
  left: PairResponseImage;
  right: PairResponseImage;
}

function normalizePair(left: string, right: string): [string, string] {
  return [left, right].sort() as [string, string];
}

function parseRecentPairs(cache: string | null): string[][] {
  if (!cache) {
    return [];
  }

  const parsed = JSON.parse(cache) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(
    (value): value is string[] =>
      Array.isArray(value) &&
      value.length === 2 &&
      value.every((part) => typeof part === "string"),
  );
}

function encodeRecentPairs(pairs: string[][]): string {
  return JSON.stringify(pairs.slice(0, RECENT_PAIR_CACHE_LIMIT));
}

function toPairResponse(pair: [string, string] | null): PairResponse | null {
  if (!pair) {
    return null;
  }

  return {
    left: { id: pair[0] },
    right: { id: pair[1] },
  };
}

function buildDefaultState(userId: string, imageId: string): PersonalImageStateRow {
  return {
    user_id: userId,
    image_id: imageId,
    rating: DEFAULT_RATING,
    comparisons: 0,
    wins: 0,
    losses: 0,
    confidence: 0,
    last_compared_at: null,
  };
}

function mapPersonalStates(
  userId: string,
  images: ImageRow[],
  rows: PersonalImageStateRow[],
): Map<string, PersonalImageStateRow> {
  const rowMap = new Map(rows.map((row) => [row.image_id, row]));

  return new Map(
    images.map((image) => [
      image.id,
      rowMap.get(image.id) ?? buildDefaultState(userId, image.id),
    ]),
  );
}

function totalComparisonCounts(
  images: ImageRow[],
  stateMap: Map<string, PersonalImageStateRow>,
): number[] {
  return images.map((image) => stateMap.get(image.id)?.comparisons ?? 0);
}

function buildNextPair(
  images: ImageRow[],
  stateMap: Map<string, PersonalImageStateRow>,
  rankingConfidence: number,
  recentPairs: string[][],
  deprioritizedImageIds: string[] = [],
): PairResponse | null {
  const pair = selectNextPair({
    rankingConfidence,
    recentPairs,
    deprioritizedImageIds,
    images: images.map((image) => {
      const state = stateMap.get(image.id);
      return {
        imageId: image.id,
        rating: state?.rating ?? DEFAULT_RATING,
        comparisons: state?.comparisons ?? 0,
        confidence: state?.confidence ?? 0,
      };
    }),
  });

  return toPairResponse(pair);
}

async function withTransaction<T>(
  db: DatabaseLike,
  work: (tx: DatabaseLike) => Promise<T>,
): Promise<T> {
  return toDbClient(db).transaction(async (tx) => work(tx));
}

export async function getNextPairForUser(
  db: DatabaseLike,
  userId: string,
): Promise<PairResponse | null> {
  const images = await listActiveImages(db);
  const personalStates = await listPersonalImageState(db, userId);
  const userState = await getUserState(db, userId);
  const stateMap = mapPersonalStates(userId, images, personalStates);

  return buildNextPair(
    images,
    stateMap,
    userState?.ranking_confidence ?? 0,
    parseRecentPairs(userState?.recent_pair_cache ?? null),
  );
}

export async function skipPairForUser(
  db: DatabaseLike,
  userId: string,
  input: SkipInput,
): Promise<{ nextPair: PairResponse | null }> {
  if (input.leftImageId === input.rightImageId) {
    throw new Error("Skipped images must differ");
  }

  const leftImage = await getImageById(db, input.leftImageId);
  const rightImage = await getImageById(db, input.rightImageId);

  if (!leftImage || !rightImage) {
    throw new Error("Both images must exist");
  }

  // A skip means "I can't decide between these two" — that's a real
  // ELO signal (effectively a tie). Apply it as such so close pairs
  // converge on each other and so the user's skipping behavior moves
  // their personal ranking, not just their pair queue.
  const result = await toDbClient(db).transaction(async (tx) => {
    const images = await listActiveImages(tx);
    const personalStates = await listPersonalImageState(tx, userId);
    const userState = await getUserState(tx, userId);
    const stateMap = mapPersonalStates(userId, images, personalStates);

    const currentLeft =
      stateMap.get(input.leftImageId) ??
      buildDefaultState(userId, input.leftImageId);
    const currentRight =
      stateMap.get(input.rightImageId) ??
      buildDefaultState(userId, input.rightImageId);
    const tied = applyEloTie({
      left: currentLeft.rating,
      right: currentRight.rating,
      leftComparisons: currentLeft.comparisons,
      rightComparisons: currentRight.comparisons,
    });
    const now = new Date().toISOString();

    const updatedLeft: PersonalImageStateRow = {
      ...currentLeft,
      rating: tied.left,
      comparisons: currentLeft.comparisons + 1,
      last_compared_at: now,
    };
    const updatedRight: PersonalImageStateRow = {
      ...currentRight,
      rating: tied.right,
      comparisons: currentRight.comparisons + 1,
      last_compared_at: now,
    };

    stateMap.set(updatedLeft.image_id, updatedLeft);
    stateMap.set(updatedRight.image_id, updatedRight);

    const comparisonCounts = totalComparisonCounts(images, stateMap);
    const averageComparisons =
      comparisonCounts.reduce((sum, count) => sum + count, 0) /
      Math.max(images.length, 1);

    updatedLeft.confidence = calculateImageConfidence({
      comparisons: updatedLeft.comparisons,
      poolAverageComparisons: averageComparisons,
    });
    updatedRight.confidence = calculateImageConfidence({
      comparisons: updatedRight.comparisons,
      poolAverageComparisons: averageComparisons,
    });

    await upsertPersonalImageState(tx, updatedLeft);
    await upsertPersonalImageState(tx, updatedRight);

    const skippedPair = normalizePair(input.leftImageId, input.rightImageId);
    const nextRecentPairs = [
      skippedPair,
      ...parseRecentPairs(userState?.recent_pair_cache ?? null).filter(
        (pair) => pair.join(":") !== skippedPair.join(":"),
      ),
    ];
    const rankingConfidence = calculateRankingConfidence({
      totalImages: images.length,
      comparisonCounts,
    });

    await upsertUserState(tx, {
      user_id: userId,
      // Skips don't count as "votes cast" in the marketing sense
      // (they're declines), so don't bump total_votes_cast.
      total_votes_cast: userState?.total_votes_cast ?? 0,
      ranking_confidence: rankingConfidence,
      recent_pair_cache: encodeRecentPairs(nextRecentPairs),
      updated_at: now,
    });

    return {
      nextPair: buildNextPair(
        images,
        stateMap,
        rankingConfidence,
        nextRecentPairs,
        [...new Set(nextRecentPairs.flat())],
      ),
    };
  });

  invalidateSharedLeaderboardCache();
  return result;
}

export interface VoteDelta {
  winner: number;
  loser: number;
}

export async function recordVoteForUser(
  db: DatabaseLike,
  userId: string,
  input: VoteInput,
): Promise<{ nextPair: PairResponse | null; delta: VoteDelta | null }> {
  if (input.winnerImageId === input.loserImageId) {
    throw new Error("Winner and loser must differ");
  }

  const winnerImage = await getImageById(db, input.winnerImageId);
  const loserImage = await getImageById(db, input.loserImageId);

  if (!winnerImage || !loserImage) {
    throw new Error("Both images must exist");
  }

  if (input.actionId) {
    const existingVoteEvent = await getVoteEventById(db, input.actionId);
    if (existingVoteEvent) {
      return {
        nextPair: await getNextPairForUser(db, userId),
        delta: null,
      };
    }
  }

  const result = await withTransaction(db, async (tx) => {
    const images = await listActiveImages(tx);
    const personalStates = await listPersonalImageState(tx, userId);
    const userState = await getUserState(tx, userId);
    const stateMap = mapPersonalStates(userId, images, personalStates);
    const currentWinner = stateMap.get(input.winnerImageId) ?? buildDefaultState(userId, input.winnerImageId);
    const currentLoser = stateMap.get(input.loserImageId) ?? buildDefaultState(userId, input.loserImageId);
    const nextRatings = applyEloVote({
      winner: currentWinner.rating,
      loser: currentLoser.rating,
      winnerComparisons: currentWinner.comparisons,
      loserComparisons: currentLoser.comparisons,
    });
    const now = new Date().toISOString();

    const updatedWinner: PersonalImageStateRow = {
      ...currentWinner,
      rating: nextRatings.winner,
      comparisons: currentWinner.comparisons + 1,
      wins: currentWinner.wins + 1,
      confidence: currentWinner.confidence,
      last_compared_at: now,
    };
    const updatedLoser: PersonalImageStateRow = {
      ...currentLoser,
      rating: nextRatings.loser,
      comparisons: currentLoser.comparisons + 1,
      losses: currentLoser.losses + 1,
      confidence: currentLoser.confidence,
      last_compared_at: now,
    };

    stateMap.set(updatedWinner.image_id, updatedWinner);
    stateMap.set(updatedLoser.image_id, updatedLoser);

    const comparisonCounts = totalComparisonCounts(images, stateMap);
    const averageComparisons =
      comparisonCounts.reduce((sum, count) => sum + count, 0) /
      Math.max(images.length, 1);

    updatedWinner.confidence = calculateImageConfidence({
      comparisons: updatedWinner.comparisons,
      poolAverageComparisons: averageComparisons,
    });
    updatedLoser.confidence = calculateImageConfidence({
      comparisons: updatedLoser.comparisons,
      poolAverageComparisons: averageComparisons,
    });

    await createVoteEvent(tx, {
      id: input.actionId ?? crypto.randomUUID(),
      user_id: userId,
      winner_image_id: input.winnerImageId,
      loser_image_id: input.loserImageId,
      context: "shared_pool_vote",
      created_at: now,
    });

    await upsertPersonalImageState(tx, updatedWinner);
    await upsertPersonalImageState(tx, updatedLoser);

    const nextRecentPairs = [
      normalizePair(input.winnerImageId, input.loserImageId),
      ...parseRecentPairs(userState?.recent_pair_cache ?? null).filter(
        (pair) =>
          pair.join(":") !==
          normalizePair(input.winnerImageId, input.loserImageId).join(":"),
      ),
    ];
    const rankingConfidence = calculateRankingConfidence({
      totalImages: images.length,
      comparisonCounts,
    });

    await upsertUserState(tx, {
      user_id: userId,
      total_votes_cast: (userState?.total_votes_cast ?? 0) + 1,
      ranking_confidence: rankingConfidence,
      recent_pair_cache: encodeRecentPairs(nextRecentPairs),
      updated_at: now,
    });

    return {
      nextPair: buildNextPair(images, stateMap, rankingConfidence, nextRecentPairs),
      delta: {
        winner: nextRatings.winner - currentWinner.rating,
        loser: nextRatings.loser - currentLoser.rating,
      },
    };
  });

  invalidateSharedLeaderboardCache();
  return result;
}

export async function flushQueuedActionsForUser(
  db: DatabaseLike,
  userId: string,
  actions: FlushActionInput[],
): Promise<{ flushedCount: number }> {
  for (const action of actions) {
    if (action.kind === "vote") {
      await recordVoteForUser(db, userId, {
        actionId: action.id,
        winnerImageId: action.winnerImageId,
        loserImageId: action.loserImageId,
      });
      continue;
    }

    await skipPairForUser(db, userId, {
      leftImageId: action.leftImageId,
      rightImageId: action.rightImageId,
    });
  }

  return {
    flushedCount: actions.length,
  };
}
