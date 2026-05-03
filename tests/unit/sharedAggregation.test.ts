import { describe, expect, it } from "vitest";
import {
  aggregateSharedRanking,
  userInfluenceWeight,
} from "../../src/server/domain/sharedAggregation";

describe("shared aggregation", () => {
  it("saturates shared influence weight", () => {
    expect(userInfluenceWeight(0, 40)).toBeCloseTo(0);
    expect(userInfluenceWeight(40, 40)).toBeCloseTo(1 - Math.exp(-1), 5);
    expect(userInfluenceWeight(200, 40)).toBeGreaterThan(
      userInfluenceWeight(40, 40),
    );
    expect(userInfluenceWeight(200, 40)).toBeLessThan(1);
  });

  it("aggregates personal rankings without letting one heavy voter dominate", () => {
    const shared = aggregateSharedRanking(
      [
        {
          userId: "u1",
          totalVotesCast: 200,
          rankingConfidence: 0.95,
          images: [
            { imageId: "img-1", rating: 1450, confidence: 0.9 },
            { imageId: "img-2", rating: 1100, confidence: 0.9 },
          ],
        },
        {
          userId: "u2",
          totalVotesCast: 24,
          rankingConfidence: 0.8,
          images: [
            { imageId: "img-1", rating: 1380, confidence: 0.75 },
            { imageId: "img-2", rating: 1180, confidence: 0.75 },
          ],
        },
        {
          userId: "u3",
          totalVotesCast: 24,
          rankingConfidence: 0.8,
          images: [
            { imageId: "img-1", rating: 1220, confidence: 0.75 },
            { imageId: "img-2", rating: 1360, confidence: 0.75 },
          ],
        },
      ],
      40,
    );

    expect(shared[0]?.imageId).toBe("img-1");
    expect(shared[1]?.imageId).toBe("img-2");
    expect(shared[0]?.rankPosition).toBe(1);
    expect(shared[0]?.confidence).toBeGreaterThan(0);
  });
});
