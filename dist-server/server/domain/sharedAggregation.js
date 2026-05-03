function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}
function mean(values) {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function standardDeviation(values) {
    if (values.length === 0) {
        return 0;
    }
    const average = mean(values);
    const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
        values.length;
    return Math.sqrt(variance);
}
export function userInfluenceWeight(votesCast, threshold = 40) {
    if (threshold <= 0) {
        return 1;
    }
    return 1 - Math.exp(-Math.max(0, votesCast) / threshold);
}
function normalizeUserImages(images) {
    const ratings = images.map((image) => image.rating);
    const average = mean(ratings);
    const spread = standardDeviation(ratings) || 1;
    return images.map((image) => ({
        imageId: image.imageId,
        confidence: image.confidence,
        score: (image.rating - average) / spread,
    }));
}
export function aggregateSharedRanking(users, threshold = 40) {
    const totals = new Map();
    for (const user of users) {
        if (user.images.length === 0) {
            continue;
        }
        const normalizedImages = normalizeUserImages(user.images);
        const baseWeight = userInfluenceWeight(user.totalVotesCast, threshold) *
            (0.35 + 0.65 * clamp01(user.rankingConfidence));
        for (const image of normalizedImages) {
            const contributionWeight = baseWeight * (0.4 + 0.6 * clamp01(image.confidence));
            const current = totals.get(image.imageId) ?? {
                contributors: 0,
                scoreWeight: 0,
                weightedScore: 0,
                confidenceWeight: 0,
            };
            current.contributors += 1;
            current.scoreWeight += contributionWeight;
            current.weightedScore += image.score * contributionWeight;
            current.confidenceWeight += clamp01(image.confidence) * contributionWeight;
            totals.set(image.imageId, current);
        }
    }
    const totalUsers = Math.max(users.length, 1);
    const rows = Array.from(totals.entries()).map(([imageId, total]) => {
        const aggregateScore = total.scoreWeight === 0 ? 0 : total.weightedScore / total.scoreWeight;
        const coverage = total.contributors / totalUsers;
        const weightSaturation = 1 - Math.exp(-total.scoreWeight);
        const confidenceFromInputs = total.scoreWeight === 0 ? 0 : total.confidenceWeight / total.scoreWeight;
        const confidence = clamp01(coverage * 0.4 + weightSaturation * 0.4 + confidenceFromInputs * 0.2);
        return {
            imageId,
            aggregateScore,
            confidence,
            effectiveVoterWeight: total.scoreWeight,
            rankPosition: 0,
        };
    });
    rows.sort((left, right) => right.aggregateScore - left.aggregateScore ||
        right.confidence - left.confidence ||
        left.imageId.localeCompare(right.imageId));
    return rows.map((row, index) => ({
        ...row,
        rankPosition: index + 1,
    }));
}
