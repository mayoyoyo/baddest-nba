const TARGET_COMPARISONS_PER_IMAGE = 6;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export interface RankingConfidenceInput {
  comparisonCounts: number[];
  totalImages: number;
}

export interface ImageConfidenceInput {
  comparisons: number;
  poolAverageComparisons: number;
}

export function calculateRankingConfidence(
  input: RankingConfidenceInput,
): number {
  if (input.totalImages <= 0) {
    return 0;
  }

  const counts = Array.from({ length: input.totalImages }, (_, index) =>
    Math.max(0, input.comparisonCounts[index] ?? 0),
  );
  const totalComparisons = counts.reduce((sum, count) => sum + count, 0);

  if (totalComparisons === 0) {
    return 0;
  }

  const coveredImages = counts.filter((count) => count > 0).length;
  const coverage = coveredImages / input.totalImages;
  const averagePerImage = totalComparisons / input.totalImages;
  const volume = 1 - Math.exp(-averagePerImage / TARGET_COMPARISONS_PER_IMAGE);

  const mean = averagePerImage;
  const variance =
    counts.reduce((sum, count) => sum + (count - mean) ** 2, 0) /
    input.totalImages;
  const standardDeviation = Math.sqrt(variance);
  const balance =
    mean === 0 ? 0 : 1 - Math.min(1, standardDeviation / (mean + 1));

  return clamp01(coverage * 0.45 + volume * 0.35 + balance * 0.2);
}

export function calculateImageConfidence(
  input: ImageConfidenceInput,
): number {
  if (input.comparisons <= 0) {
    return 0;
  }

  const referenceComparisons = Math.max(3, input.poolAverageComparisons);
  return clamp01(1 - Math.exp(-input.comparisons / referenceComparisons));
}
