import { describe, expect, it } from "vitest";
import { selectNextPair } from "../../src/server/domain/pairing";

describe("pairing", () => {
  it("avoids immediately repeating the last pair", () => {
    const pair = selectNextPair({
      rankingConfidence: 0.85,
      recentPairs: [["img-1", "img-2"]],
      images: [
        { imageId: "img-1", rating: 1200, comparisons: 2, confidence: 0.4 },
        { imageId: "img-2", rating: 1210, comparisons: 2, confidence: 0.4 },
        { imageId: "img-3", rating: 1220, comparisons: 1, confidence: 0.2 },
      ],
    });

    expect(pair).not.toBeNull();
    expect(pair?.slice().sort()).not.toEqual(["img-1", "img-2"]);
  });

  it("can vary among equally needy anchors instead of always picking the same image", () => {
    const pair = selectNextPair({
      rankingConfidence: 0.2,
      random: () => 0.99,
      recentPairs: [["img-a", "img-b"]],
      images: [
        { imageId: "img-a", rating: 1000, comparisons: 0, confidence: 0 },
        { imageId: "img-b", rating: 1300, comparisons: 0, confidence: 0 },
        { imageId: "img-c", rating: 1010, comparisons: 8, confidence: 1 },
        { imageId: "img-d", rating: 1310, comparisons: 8, confidence: 1 },
      ],
    });

    expect(pair).not.toBeNull();
    expect(pair?.slice().sort()).toEqual(["img-b", "img-d"]);
  });

  it("does not force the anchor image to stay on the left side", () => {
    const pair = selectNextPair({
      rankingConfidence: 0.2,
      random: () => 0.99,
      images: [
        { imageId: "img-a", rating: 1200, comparisons: 0, confidence: 0 },
        { imageId: "img-b", rating: 1200, comparisons: 1, confidence: 0.1 },
      ],
    });

    expect(pair).toEqual(["img-b", "img-a"]);
  });

  it("deprioritizes images that already appeared in the most recent matchups", () => {
    const pair = selectNextPair({
      rankingConfidence: 0.2,
      recentPairs: [
        ["kendall", "opponent-1"],
        ["kendall", "opponent-2"],
      ],
      images: [
        { imageId: "kendall", rating: 1200, comparisons: 0, confidence: 0 },
        { imageId: "kylie", rating: 1200, comparisons: 0, confidence: 0 },
        { imageId: "opponent-1", rating: 1180, comparisons: 5, confidence: 0.8 },
        { imageId: "opponent-2", rating: 1220, comparisons: 5, confidence: 0.8 },
      ],
    });

    expect(pair).not.toBeNull();
    expect(pair).toContain("kylie");
    expect(pair).not.toContain("kendall");
  });

  it("blocks an image for four matchups after it appears twice within three", () => {
    const images = ["jhene", "a", "b", "c", "d", "e", "f", "g", "h", "i"].map(
      (imageId, index) => ({
        imageId,
        rating: 1200 + index,
        comparisons: imageId === "jhene" ? 0 : 4,
        confidence: 0,
      }),
    );
    let recentPairs: string[][] = [
      ["jhene", "c"],
      ["a", "b"],
      ["jhene", "a"],
    ];

    for (let index = 0; index < 4; index += 1) {
      const pair = selectNextPair({
        rankingConfidence: 0.2,
        random: () => 0.25,
        recentPairs,
        images,
      });

      expect(pair).not.toBeNull();
      expect(pair).not.toContain("jhene");
      if (!pair) {
        return;
      }

      recentPairs = [pair, ...recentPairs];
    }
  });

  it("still allows a blocked image when the pool is too small to form another pair", () => {
    const pair = selectNextPair({
      rankingConfidence: 0.2,
      recentPairs: [
        ["jhene", "b"],
        ["jhene", "a"],
      ],
      images: [
        { imageId: "jhene", rating: 1200, comparisons: 0, confidence: 0 },
        { imageId: "a", rating: 1210, comparisons: 1, confidence: 0 },
      ],
    });

    expect(pair?.slice().sort()).toEqual(["a", "jhene"]);
  });
});
