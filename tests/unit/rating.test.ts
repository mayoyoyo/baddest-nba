import { describe, expect, it } from "vitest";
import { applyEloVote } from "../../src/server/domain/rating";

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
});
