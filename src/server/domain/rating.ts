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

export interface EloTieInput {
  left: number;
  right: number;
  leftComparisons?: number;
  rightComparisons?: number;
  k?: number;
}

// Standard chess tie: each side scored 0.5. The higher-rated side
// loses a little, the lower-rated side gains a little. If they were
// equal going in, neither rating moves. Skip == "I can't decide" is
// real information about how close these two are.
export function applyEloTie(input: EloTieInput): {
  left: number;
  right: number;
} {
  const expectedLeft = expectedScore(input.left, input.right);
  const expectedRight = expectedScore(input.right, input.left);
  const leftK = input.k ?? dynamicK(input.leftComparisons ?? 0);
  const rightK = input.k ?? dynamicK(input.rightComparisons ?? 0);

  return {
    left: input.left + leftK * (0.5 - expectedLeft),
    right: input.right + rightK * (0.5 - expectedRight),
  };
}
