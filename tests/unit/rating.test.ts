import { describe, expect, it } from "vitest";
import { applyEloVote, dynamicK } from "../../src/server/domain/rating";

describe("rating", () => {
  it("raises the winner rating and lowers the loser rating", () => {
    const next = applyEloVote({ winner: 1200, loser: 1200, k: 32 });

    expect(next.winner).toBeCloseTo(1216, 5);
    expect(next.loser).toBeCloseTo(1184, 5);
  });

  it("moves an expected win less than an even matchup", () => {
    const even = applyEloVote({ winner: 1200, loser: 1200, k: 32 });
    const favorite = applyEloVote({ winner: 1400, loser: 1000, k: 32 });

    expect(favorite.winner - 1400).toBeLessThan(even.winner - 1200);
  });

  describe("dynamicK", () => {
    it("uses K=48 for fewer than 6 comparisons", () => {
      expect(dynamicK(0)).toBe(48);
      expect(dynamicK(5)).toBe(48);
    });

    it("uses K=32 for 6-15 comparisons", () => {
      expect(dynamicK(6)).toBe(32);
      expect(dynamicK(15)).toBe(32);
    });

    it("uses K=24 for 16-30 comparisons", () => {
      expect(dynamicK(16)).toBe(24);
      expect(dynamicK(30)).toBe(24);
    });

    it("uses K=16 once locked in (31+)", () => {
      expect(dynamicK(31)).toBe(16);
      expect(dynamicK(1000)).toBe(16);
    });
  });

  describe("applyEloVote with dynamic K", () => {
    it("decays each side independently by its own comparison count", () => {
      const next = applyEloVote({
        winner: 1200,
        loser: 1200,
        winnerComparisons: 0,
        loserComparisons: 100,
      });

      // winner moves by K=48 * 0.5 = 24; loser moves by K=16 * 0.5 = 8
      expect(next.winner - 1200).toBeCloseTo(24, 5);
      expect(1200 - next.loser).toBeCloseTo(8, 5);
    });

    it("explicit k overrides dynamic K", () => {
      const next = applyEloVote({
        winner: 1200,
        loser: 1200,
        winnerComparisons: 0,
        loserComparisons: 100,
        k: 32,
      });

      expect(next.winner).toBeCloseTo(1216, 5);
      expect(next.loser).toBeCloseTo(1184, 5);
    });
  });
});
