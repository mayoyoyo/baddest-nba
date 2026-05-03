import { calculateImageConfidence, calculateRankingConfidence } from "../domain/confidence.js";
import { RECENT_PAIR_CACHE_LIMIT, selectNextPair } from "../domain/pairing.js";
import { applyEloVote } from "../domain/rating.js";
import { toDbClient } from "../lib/db.js";
import { getImageById, listActiveImages } from "../repositories/imagesRepo.js";
import { getUserState, upsertPersonalImageState, upsertUserState, listPersonalImageState, } from "../repositories/leaderboardsRepo.js";
import { createVoteEvent, getVoteEventById } from "../repositories/votesRepo.js";
const DEFAULT_RATING = 1200;
function normalizePair(left, right) {
    return [left, right].sort();
}
function parseRecentPairs(cache) {
    if (!cache) {
        return [];
    }
    const parsed = JSON.parse(cache);
    if (!Array.isArray(parsed)) {
        return [];
    }
    return parsed.filter((value) => Array.isArray(value) &&
        value.length === 2 &&
        value.every((part) => typeof part === "string"));
}
function encodeRecentPairs(pairs) {
    return JSON.stringify(pairs.slice(0, RECENT_PAIR_CACHE_LIMIT));
}
function toPairResponse(pair) {
    if (!pair) {
        return null;
    }
    return {
        left: { id: pair[0] },
        right: { id: pair[1] },
    };
}
function buildDefaultState(userId, imageId) {
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
function mapPersonalStates(userId, images, rows) {
    const rowMap = new Map(rows.map((row) => [row.image_id, row]));
    return new Map(images.map((image) => [
        image.id,
        rowMap.get(image.id) ?? buildDefaultState(userId, image.id),
    ]));
}
function totalComparisonCounts(images, stateMap) {
    return images.map((image) => stateMap.get(image.id)?.comparisons ?? 0);
}
function buildNextPair(images, stateMap, rankingConfidence, recentPairs, deprioritizedImageIds = []) {
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
async function withTransaction(db, work) {
    return toDbClient(db).transaction(async (tx) => work(tx));
}
export async function getNextPairForUser(db, userId) {
    const images = await listActiveImages(db);
    const personalStates = await listPersonalImageState(db, userId);
    const userState = await getUserState(db, userId);
    const stateMap = mapPersonalStates(userId, images, personalStates);
    return buildNextPair(images, stateMap, userState?.ranking_confidence ?? 0, parseRecentPairs(userState?.recent_pair_cache ?? null));
}
export async function skipPairForUser(db, userId, input) {
    if (input.leftImageId === input.rightImageId) {
        throw new Error("Skipped images must differ");
    }
    const leftImage = await getImageById(db, input.leftImageId);
    const rightImage = await getImageById(db, input.rightImageId);
    if (!leftImage || !rightImage) {
        throw new Error("Both images must exist");
    }
    const images = await listActiveImages(db);
    const personalStates = await listPersonalImageState(db, userId);
    const userState = await getUserState(db, userId);
    const stateMap = mapPersonalStates(userId, images, personalStates);
    const rankingConfidence = userState?.ranking_confidence ??
        calculateRankingConfidence({
            totalImages: images.length,
            comparisonCounts: totalComparisonCounts(images, stateMap),
        });
    const skippedPair = normalizePair(input.leftImageId, input.rightImageId);
    const nextRecentPairs = [
        skippedPair,
        ...parseRecentPairs(userState?.recent_pair_cache ?? null).filter((pair) => pair.join(":") !== skippedPair.join(":")),
    ];
    await upsertUserState(db, {
        user_id: userId,
        total_votes_cast: userState?.total_votes_cast ?? 0,
        ranking_confidence: rankingConfidence,
        recent_pair_cache: encodeRecentPairs(nextRecentPairs),
        updated_at: new Date().toISOString(),
    });
    return {
        nextPair: buildNextPair(images, stateMap, rankingConfidence, nextRecentPairs, [...new Set(nextRecentPairs.flat())]),
    };
}
export async function recordVoteForUser(db, userId, input) {
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
        });
        const now = new Date().toISOString();
        const updatedWinner = {
            ...currentWinner,
            rating: nextRatings.winner,
            comparisons: currentWinner.comparisons + 1,
            wins: currentWinner.wins + 1,
            confidence: currentWinner.confidence,
            last_compared_at: now,
        };
        const updatedLoser = {
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
        const averageComparisons = comparisonCounts.reduce((sum, count) => sum + count, 0) /
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
            ...parseRecentPairs(userState?.recent_pair_cache ?? null).filter((pair) => pair.join(":") !==
                normalizePair(input.winnerImageId, input.loserImageId).join(":")),
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
        };
    });
    return result;
}
export async function flushQueuedActionsForUser(db, userId, actions) {
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
