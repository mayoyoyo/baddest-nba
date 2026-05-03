import { describe, expect, it } from "vitest";
import {
  applyQueuedActions,
  getSpeculativePrefetchImageIds,
  type QueuedAction,
  type VoteSessionState,
} from "../../src/client/lib/voteSession";

describe("vote session prefetch", () => {
  it("includes images needed for skip outcomes, not just vote outcomes", () => {
    const session: VoteSessionState = {
      images: [
        {
          id: "alpha",
          rating: 1200,
          comparisons: 0,
          wins: 0,
          losses: 0,
          confidence: 0,
        },
        {
          id: "beta",
          rating: 1200,
          comparisons: 0,
          wins: 0,
          losses: 0,
          confidence: 0,
        },
        {
          id: "gamma",
          rating: 1200,
          comparisons: 0,
          wins: 0,
          losses: 0,
          confidence: 0,
        },
        {
          id: "delta",
          rating: 1200,
          comparisons: 5,
          wins: 0,
          losses: 0,
          confidence: 1,
        },
      ],
      pair: {
        left: { id: "alpha" },
        right: { id: "beta" },
      },
      rankingConfidence: 0,
      recentPairs: [],
      totalVotesCast: 0,
    };

    expect(getSpeculativePrefetchImageIds(session).slice().sort()).toEqual([
      "delta",
      "gamma",
    ]);
  });

  it("keeps nine recent matchups in the local cooldown history", () => {
    const session: VoteSessionState = {
      images: [
        "alpha",
        "beta",
        "gamma",
        "delta",
        "epsilon",
        "zeta",
      ].map((id) => ({
        id,
        rating: 1200,
        comparisons: 0,
        wins: 0,
        losses: 0,
        confidence: 0,
      })),
      pair: {
        left: { id: "alpha" },
        right: { id: "beta" },
      },
      rankingConfidence: 0,
      recentPairs: [],
      totalVotesCast: 0,
    };
    const actions: QueuedAction[] = [
      ["alpha", "beta"],
      ["gamma", "delta"],
      ["epsilon", "zeta"],
      ["alpha", "gamma"],
      ["beta", "delta"],
      ["alpha", "delta"],
      ["beta", "epsilon"],
      ["gamma", "zeta"],
      ["delta", "epsilon"],
    ].map(([leftImageId, rightImageId], index) => ({
      id: `skip-${index + 1}`,
      createdAt: `2026-04-21T00:00:0${index}.000Z`,
      kind: "skip",
      leftImageId,
      rightImageId,
    }));

    const nextSession = applyQueuedActions(session, actions);

    expect(nextSession.recentPairs).toHaveLength(9);
    expect(nextSession.recentPairs[0]).toEqual(["delta", "epsilon"]);
    expect(nextSession.recentPairs[8]).toEqual(["alpha", "beta"]);
  });
});
