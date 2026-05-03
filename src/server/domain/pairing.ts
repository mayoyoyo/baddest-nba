export interface PairingImageInput {
  comparisons: number;
  confidence: number;
  imageId: string;
  rating: number;
}

export interface PairingInput {
  deprioritizedImageIds?: string[];
  images: PairingImageInput[];
  rankingConfidence: number;
  recentPairs?: string[][];
  random?: () => number;
}

export const EXACT_PAIR_COOLDOWN_MATCHUPS = 9;
export const REPEATED_IMAGE_TRIGGER_WINDOW = 3;
export const REPEATED_IMAGE_TRIGGER_COUNT = 2;
export const REPEATED_IMAGE_BLOCK_MATCHUPS = 4;
export const RECENT_IMAGE_EXPOSURE_WINDOW = 6;
export const RECENT_PAIR_CACHE_LIMIT = Math.max(
  EXACT_PAIR_COOLDOWN_MATCHUPS,
  RECENT_IMAGE_EXPOSURE_WINDOW,
);

function normalizePairKey(left: string, right: string): string {
  return [left, right].sort().join(":");
}

function sortByAnchorNeed(
  left: PairingImageInput,
  right: PairingImageInput,
): number {
  return (
    left.comparisons - right.comparisons ||
    left.confidence - right.confidence
  );
}

function sortExploratoryOpponents(
  anchor: PairingImageInput,
  left: PairingImageInput,
  right: PairingImageInput,
): number {
  return (
    left.comparisons - right.comparisons ||
    left.confidence - right.confidence ||
    Math.abs(left.rating - anchor.rating) - Math.abs(right.rating - anchor.rating)
  );
}

function sortRefinementOpponents(
  anchor: PairingImageInput,
  left: PairingImageInput,
  right: PairingImageInput,
): number {
  return (
    Math.abs(left.rating - anchor.rating) - Math.abs(right.rating - anchor.rating) ||
    left.comparisons - right.comparisons ||
    left.confidence - right.confidence
  );
}

function compareDeprioritized(
  deprioritizedImageIds: Set<string>,
  leftImageId: string,
  rightImageId: string,
): number {
  return (
    Number(deprioritizedImageIds.has(leftImageId)) -
    Number(deprioritizedImageIds.has(rightImageId))
  );
}

function buildBlockedImageIds(
  recentPairs: string[][],
): Set<string> {
  const occurrenceIndexes = new Map<string, number[]>();

  recentPairs.forEach((pair, pairIndex) => {
    pair.forEach((imageId) => {
      const indexes = occurrenceIndexes.get(imageId) ?? [];
      indexes.push(pairIndex);
      occurrenceIndexes.set(imageId, indexes);
    });
  });

  const blockedImageIds = new Set<string>();

  occurrenceIndexes.forEach((indexes, imageId) => {
    const activeTrigger = indexes.some((pairIndex, index) => {
      if (pairIndex >= REPEATED_IMAGE_BLOCK_MATCHUPS) {
        return false;
      }

      const nextOlderPairIndex = indexes[index + 1];
      if (nextOlderPairIndex === undefined) {
        return false;
      }

      return (
        nextOlderPairIndex - pairIndex <=
        REPEATED_IMAGE_TRIGGER_WINDOW - REPEATED_IMAGE_TRIGGER_COUNT + 1
      );
    });

    if (activeTrigger) {
      blockedImageIds.add(imageId);
    }
  });

  return blockedImageIds;
}

function buildRecentImageExposure(
  recentPairs: string[][],
): Map<string, number> {
  const exposure = new Map<string, number>();

  recentPairs
    .slice(0, RECENT_IMAGE_EXPOSURE_WINDOW)
    .forEach((pair, index, pairs) => {
      const weight = pairs.length - index;

      pair.forEach((imageId) => {
        exposure.set(imageId, (exposure.get(imageId) ?? 0) + weight);
      });
    });

  return exposure;
}

function compareRecentExposure(
  recentImageExposure: Map<string, number>,
  leftImageId: string,
  rightImageId: string,
): number {
  return (
    (recentImageExposure.get(leftImageId) ?? 0) -
    (recentImageExposure.get(rightImageId) ?? 0)
  );
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed || 1;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function createPairingRandom(_input: PairingInput): () => number {
  // Use real randomness so a page refresh surfaces a fresh matchup. The
  // recent-pair cooldown logic still prevents back-to-back duplicates
  // (anchor-need ranking + repeated-image dampening run upstream of the
  // random tiebreak).
  return Math.random;
}

function withRandomFirst<T>(items: T[], random: () => number): T[] {
  if (items.length < 2) {
    return items;
  }

  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  const selected = items[index];

  return [selected, ...items.filter((_, itemIndex) => itemIndex !== index)];
}

function buildAnchorPool(
  anchors: PairingImageInput[],
  deprioritizedImageIds: Set<string>,
): PairingImageInput[] {
  const firstAnchor = anchors[0];
  if (!firstAnchor) {
    return [];
  }

  return anchors.filter(
    (candidate) =>
      compareDeprioritized(
        deprioritizedImageIds,
        firstAnchor.imageId,
        candidate.imageId,
      ) === 0 &&
      candidate.comparisons === firstAnchor.comparisons,
  );
}

export function selectNextPair(
  input: PairingInput,
): [string, string] | null {
  if (input.images.length < 2) {
    return null;
  }

  const cooledRecentPairs = (input.recentPairs ?? []).slice(
    0,
    EXACT_PAIR_COOLDOWN_MATCHUPS,
  );
  const recentPairKeys = new Set(
    cooledRecentPairs.map(([left, right]) => normalizePairKey(left, right)),
  );
  const deprioritizedImageIds = new Set(input.deprioritizedImageIds ?? []);
  const recentImageExposure = buildRecentImageExposure(input.recentPairs ?? []);
  const blockedImageIds = buildBlockedImageIds(input.recentPairs ?? []);
  const random = input.random ?? createPairingRandom(input);
  const exploratory = input.rankingConfidence < 0.6;
  const candidateImages =
    input.images.filter((image) => !blockedImageIds.has(image.imageId)).length >= 2
      ? input.images.filter((image) => !blockedImageIds.has(image.imageId))
      : input.images;
  const remainingAnchors = [...candidateImages].sort(
    (left, right) =>
      compareDeprioritized(deprioritizedImageIds, left.imageId, right.imageId) ||
      sortByAnchorNeed(left, right) ||
      compareRecentExposure(recentImageExposure, left.imageId, right.imageId) ||
      left.imageId.localeCompare(right.imageId),
  );

  while (remainingAnchors.length > 0) {
    const anchorPool = buildAnchorPool(
      remainingAnchors,
      deprioritizedImageIds,
    );
    const orderedAnchors = withRandomFirst(anchorPool, random);

    for (const anchor of orderedAnchors) {
      const anchorIndex = remainingAnchors.findIndex(
        (candidate) => candidate.imageId === anchor.imageId,
      );
      if (anchorIndex >= 0) {
        remainingAnchors.splice(anchorIndex, 1);
      }

      const opponents = candidateImages
        .filter((image) => image.imageId !== anchor.imageId)
        .sort((left, right) => {
          return (
            compareDeprioritized(deprioritizedImageIds, left.imageId, right.imageId) ||
            compareRecentExposure(recentImageExposure, left.imageId, right.imageId) ||
            (exploratory
              ? sortExploratoryOpponents(anchor, left, right)
              : sortRefinementOpponents(anchor, left, right)) ||
            left.imageId.localeCompare(right.imageId)
          );
        });

      const freshOpponent =
        opponents.find(
          (candidate) =>
            !recentPairKeys.has(normalizePairKey(anchor.imageId, candidate.imageId)),
        ) ?? opponents[0];

      if (freshOpponent) {
        return random() < 0.5
          ? [anchor.imageId, freshOpponent.imageId]
          : [freshOpponent.imageId, anchor.imageId];
      }
    }
  }

  return [input.images[0].imageId, input.images[1].imageId];
}
