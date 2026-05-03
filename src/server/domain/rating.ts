export interface EloVoteInput {
  loser: number;
  loserComparisons?: number;
  winner: number;
  winnerComparisons?: number;
  k?: number;
}

function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

// Tier-based K-factor (chess convention, ported from oscar-journey).
// New ratings move fast; established ratings stabilize so a single fluke
// vote can't whipsaw a top player. K=32 is the previous flat default.
export function dynamicK(comparisons: number): number {
  if (comparisons <= 5) return 48;
  if (comparisons <= 15) return 32;
  if (comparisons <= 30) return 24;
  return 16;
}

export function applyEloVote(input: EloVoteInput): {
  loser: number;
  winner: number;
} {
  const expectedWinner = expectedScore(input.winner, input.loser);
  const expectedLoser = expectedScore(input.loser, input.winner);
  const winnerK = input.k ?? dynamicK(input.winnerComparisons ?? 0);
  const loserK = input.k ?? dynamicK(input.loserComparisons ?? 0);

  return {
    winner: input.winner + winnerK * (1 - expectedWinner),
    loser: input.loser + loserK * (0 - expectedLoser),
  };
}
