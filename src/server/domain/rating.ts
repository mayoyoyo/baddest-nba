const DEFAULT_K = 32;

export interface EloVoteInput {
  k?: number;
  loser: number;
  winner: number;
}

function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function applyEloVote(input: EloVoteInput): {
  loser: number;
  winner: number;
} {
  const k = input.k ?? DEFAULT_K;
  const expectedWinner = expectedScore(input.winner, input.loser);
  const expectedLoser = expectedScore(input.loser, input.winner);

  return {
    winner: input.winner + k * (1 - expectedWinner),
    loser: input.loser + k * (0 - expectedLoser),
  };
}
