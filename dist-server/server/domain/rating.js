const DEFAULT_K = 32;
function expectedScore(rating, opponentRating) {
    return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}
export function applyEloVote(input) {
    const k = input.k ?? DEFAULT_K;
    const expectedWinner = expectedScore(input.winner, input.loser);
    const expectedLoser = expectedScore(input.loser, input.winner);
    return {
        winner: input.winner + k * (1 - expectedWinner),
        loser: input.loser + k * (0 - expectedLoser),
    };
}
