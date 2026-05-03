import { listActiveImages } from "../repositories/imagesRepo.js";
import type { DatabaseLike } from "../lib/db.js";
import { aggregateSharedRanking } from "../domain/sharedAggregation.js";
import { isVisibleUser } from "../lib/visibleUsers.js";
import {
  getUserState,
  listAllPersonalImageState,
  listAllUserStates,
  listPersonalImageState,
  type PersonalImageStateRow,
  type UserStateRow,
} from "../repositories/leaderboardsRepo.js";
import { getUserByUsername, listUsers } from "../repositories/usersRepo.js";

function buildSharedStateRows(input: {
  allPersonalState: PersonalImageStateRow[];
  allUserStates: UserStateRow[];
  imageIds: string[];
}): Array<{
  aggregateScore: number;
  confidence: number;
  effectiveVoterWeight: number;
  imageId: string;
  rankPosition: number;
}> {
  const statesByUser = new Map<string, PersonalImageStateRow[]>();

  for (const state of input.allPersonalState) {
    const nextStates = statesByUser.get(state.user_id) ?? [];
    nextStates.push(state);
    statesByUser.set(state.user_id, nextStates);
  }

  const aggregateRows = aggregateSharedRanking(
    input.allUserStates.map((userState) => ({
      userId: userState.user_id,
      totalVotesCast: userState.total_votes_cast,
      rankingConfidence: userState.ranking_confidence,
      images: (statesByUser.get(userState.user_id) ?? []).map((state) => ({
        imageId: state.image_id,
        rating: state.rating,
        confidence: state.confidence,
      })),
    })),
  );
  const aggregateMap = new Map(aggregateRows.map((row) => [row.imageId, row]));

  return input.imageIds
    .map((imageId) => {
      const aggregate = aggregateMap.get(imageId);
      return (
        aggregate ?? {
          imageId,
          aggregateScore: 0,
          confidence: 0,
          effectiveVoterWeight: 0,
          rankPosition: 0,
        }
      );
    })
    .sort(
      (left, right) =>
        right.aggregateScore - left.aggregateScore ||
        right.confidence - left.confidence ||
        left.imageId.localeCompare(right.imageId),
    )
    .map((row, index) => ({
      ...row,
      rankPosition: index + 1,
    }));
}

export async function getSharedLeaderboard(db: DatabaseLike): Promise<{
  leaderboard: Array<{
    aggregateScore: number;
    confidence: number;
    effectiveVoterWeight: number;
    image: { id: string };
    rankPosition: number;
    wins: number;
  }>;
}> {
  const [images, users, allPersonalState, allUserStates] = await Promise.all([
    listActiveImages(db),
    listUsers(db),
    listAllPersonalImageState(db),
    listAllUserStates(db),
  ]);
  const visibleUserIds = new Set(
    users.filter((user) => isVisibleUser(user.username)).map((user) => user.id),
  );
  const visiblePersonalState = allPersonalState.filter((row) =>
    visibleUserIds.has(row.user_id),
  );
  const visibleUserStates = allUserStates.filter((row) =>
    visibleUserIds.has(row.user_id),
  );
  const sharedStateRows = buildSharedStateRows({
    imageIds: images.map((image) => image.id),
    allPersonalState: visiblePersonalState,
    allUserStates: visibleUserStates,
  });
  const sharedStateMap = new Map(
    sharedStateRows.map((row) => [row.imageId, row]),
  );
  const winsByImage = new Map<string, number>();

  for (const row of visiblePersonalState) {
    winsByImage.set(row.image_id, (winsByImage.get(row.image_id) ?? 0) + row.wins);
  }

  const leaderboard = images
    .map((image) => {
      const row = sharedStateMap.get(image.id);
      return {
        image: { id: image.id },
        aggregateScore: row?.aggregateScore ?? 0,
        confidence: row?.confidence ?? 0,
        effectiveVoterWeight: row?.effectiveVoterWeight ?? 0,
        rankPosition: row?.rankPosition ?? Number.MAX_SAFE_INTEGER,
        wins: winsByImage.get(image.id) ?? 0,
      };
    })
    .sort(
      (left, right) =>
        left.rankPosition - right.rankPosition ||
        right.aggregateScore - left.aggregateScore ||
        left.image.id.localeCompare(right.image.id),
    )
    .map((row, index) => ({
      ...row,
      rankPosition: index + 1,
    }));

  return { leaderboard };
}

export async function getUserLeaderboard(
  db: DatabaseLike,
  username: string,
): Promise<{
  leaderboard: Array<{
    comparisons: number;
    confidence: number;
    image: { id: string };
    losses: number;
    rankPosition: number;
    rating: number;
    wins: number;
  }>;
  summary: {
    rankingConfidence: number;
    totalVotesCast: number;
  };
  user: {
    id: string;
    role: string;
    username: string;
  };
} | null> {
  const user = await getUserByUsername(db, username);
  if (!user) {
    return null;
  }

  const images = await listActiveImages(db);
  const personalState = await listPersonalImageState(db, user.id);
  const userState = await getUserState(db, user.id);
  const personalStateMap = new Map(personalState.map((row) => [row.image_id, row]));

  const leaderboard = images
    .map((image) => {
      const row = personalStateMap.get(image.id);
      return {
        image: { id: image.id },
        rating: row?.rating ?? 1200,
        comparisons: row?.comparisons ?? 0,
        wins: row?.wins ?? 0,
        losses: row?.losses ?? 0,
        confidence: row?.confidence ?? 0,
        rankPosition: 0,
      };
    })
    .sort(
      (left, right) =>
        right.rating - left.rating ||
        right.confidence - left.confidence ||
        left.image.id.localeCompare(right.image.id),
    )
    .map((row, index) => ({
      ...row,
      rankPosition: index + 1,
    }));

  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    summary: {
      totalVotesCast: userState?.total_votes_cast ?? 0,
      rankingConfidence: userState?.ranking_confidence ?? 0,
    },
    leaderboard,
  };
}

export async function getPeople(db: DatabaseLike): Promise<{
  users: Array<{
    summary: {
      rankingConfidence: number;
      totalVotesCast: number;
    };
    username: string;
  }>;
}> {
  const [users, allUserStates] = await Promise.all([
    listUsers(db),
    listAllUserStates(db),
  ]);
  const stateByUserId = new Map(
    allUserStates.map((state) => [state.user_id, state]),
  );

  return {
    users: users
      .filter((user) => isVisibleUser(user.username))
      .map((user) => {
        const state = stateByUserId.get(user.id);

        return {
          username: user.username,
          summary: {
            totalVotesCast: state?.total_votes_cast ?? 0,
            rankingConfidence: state?.ranking_confidence ?? 0,
          },
        };
      })
      .sort(
        (left, right) =>
          right.summary.totalVotesCast - left.summary.totalVotesCast ||
          right.summary.rankingConfidence - left.summary.rankingConfidence ||
          left.username.localeCompare(right.username),
      ),
  };
}
