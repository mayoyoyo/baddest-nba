import { describe, expect, it } from "vitest";
import {
  calculateImageConfidence,
  calculateRankingConfidence,
} from "../../src/server/domain/confidence";

describe("confidence", () => {
  it("returns no ranking confidence without comparisons", () => {
    expect(
      calculateRankingConfidence({
        totalImages: 6,
        comparisonCounts: [0, 0, 0, 0, 0, 0],
      }),
    ).toBe(0);
  });

  it("rewards broader and more balanced coverage", () => {
    const sparse = calculateRankingConfidence({
      totalImages: 6,
      comparisonCounts: [6, 0, 0, 0, 0, 0],
    });
    const broad = calculateRankingConfidence({
      totalImages: 6,
      comparisonCounts: [4, 4, 4, 4, 4, 4],
    });

    expect(broad).toBeGreaterThan(sparse);
  });

  it("increases image confidence as comparisons accumulate", () => {
    const low = calculateImageConfidence({
      comparisons: 1,
      poolAverageComparisons: 6,
    });
    const high = calculateImageConfidence({
      comparisons: 8,
      poolAverageComparisons: 6,
    });

    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
  });
});
