import { listActiveImages } from "../repositories/imagesRepo.js";
import type { DatabaseLike } from "../lib/db.js";
import { aggregateSharedRanking } from "../domain/sharedAggregation.js";
import { isPublicVoter } from "../lib/auth.js";
import { type Conference, getConference } from "../lib/conferences.js";
import { isVisibleUser } from "../lib/visibleUsers.js";
import {
  getBaddestTeamForUser,
  getGlobalImageRatingAverages,
  getTopRatedImageIdForUser,
  getUserState,
  listAllPersonalImageState,
  listAllUserStates,
  listPersonalImageState,
  type PersonalImageStateRow,
  type UserStateRow,
} from "../repositories/leaderboardsRepo.js";
import {
  listPlayersByImageIds,
  type PlayerRow,
} from "../repositories/playersRepo.js";
import { getUserByUsername, listUsers } from "../repositories/usersRepo.js";
import {
  readSharedLeaderboardCache,
  writeSharedLeaderboardCache,
} from "./leaderboardCache.js";

export interface PlayerMeta {
  first: string;
  last: string;
  team: string | null;
  teamFull: string | null;
  jersey: string | null;
  pos: string | null;
  conference: Conference | null;
}

function toPlayerMeta(row: PlayerRow | undefined): PlayerMeta | null {
  if (!row) return null;
  return {
    first: row.first,
    last: row.last,
    team: row.team,
    teamFull: row.team_full,
    jersey: row.jersey,
    pos: row.pos,
    conference: getConference(row.team),
  };
}

async function loadPlayersMap(
  db: DatabaseLike,
  imageIds: string[],
): Promise<Map<string, PlayerRow>> {
  const players = await listPlayersByImageIds(db, imageIds);
  return new Map(players.map((player) => [player.id, player]));
}

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

export interface SharedLeaderboardEntry {
  aggregateScore: number;
  confidence: number;
  effectiveVoterWeight: number;
  image: { id: string };
  player: PlayerMeta | null;
  rankPosition: number;
  totalComparisons: number;
  // Viewer-specific personal record. Always present in the response;
  // zero for anonymous viewers or for players the viewer hasn't seen.
  viewerWins: number;
  viewerLosses: number;
  viewerComparisons: number;
  wins: number;
}

// Aggregate score arrives from sharedAggregation as a Z-score across
// all users (~-3..+3). Remap to a 1200-centered ELO-ish display value
// so personal ratings and global scores live on the same axis. Pure
// cosmetic — ordering is preserved.
const SHARED_DISPLAY_BASE = 1200;
const SHARED_DISPLAY_STDDEV = 100;
function toDisplayScore(zscore: number): number {
  return SHARED_DISPLAY_BASE + zscore * SHARED_DISPLAY_STDDEV;
}

export interface SharedLeaderboardResponse {
  leaderboard: SharedLeaderboardEntry[];
}

export async function getSharedLeaderboard(
  db: DatabaseLike,
  viewerId?: string | null,
): Promise<SharedLeaderboardResponse> {
  const base = await getSharedLeaderboardBase(db);
  if (!viewerId) return base;

  // Layer the viewer's personal W-L on top per request. The base
  // leaderboard cache stays viewer-agnostic so it's safe to share
  // across users.
  const viewerStates = await listPersonalImageState(db, viewerId);
  const viewerMap = new Map(viewerStates.map((row) => [row.image_id, row]));
  return {
    leaderboard: base.leaderboard.map((row) => {
      const personal = viewerMap.get(row.image.id);
      return {
        ...row,
        viewerWins: personal?.wins ?? 0,
        viewerLosses: personal?.losses ?? 0,
        viewerComparisons: personal?.comparisons ?? 0,
      };
    }),
  };
}

async function getSharedLeaderboardBase(
  db: DatabaseLike,
): Promise<SharedLeaderboardResponse> {
  const cached = readSharedLeaderboardCache<SharedLeaderboardResponse>();
  if (cached) {
    return cached;
  }

  const [images, users, allPersonalState, allUserStates] = await Promise.all([
    listActiveImages(db),
    listUsers(db),
    listAllPersonalImageState(db),
    listAllUserStates(db),
  ]);
  const playersMap = await loadPlayersMap(
    db,
    images.map((image) => image.id),
  );
  const visibleUserIds = new Set(
    users
      .filter(
        (user) => isPublicVoter(user.role) && isVisibleUser(user.username),
      )
      .map((user) => user.id),
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
  const comparisonsByImage = new Map<string, number>();

  for (const row of visiblePersonalState) {
    winsByImage.set(row.image_id, (winsByImage.get(row.image_id) ?? 0) + row.wins);
    comparisonsByImage.set(
      row.image_id,
      (comparisonsByImage.get(row.image_id) ?? 0) + row.comparisons,
    );
  }

  const leaderboard = images
    .map((image) => {
      const row = sharedStateMap.get(image.id);
      return {
        image: { id: image.id },
        player: toPlayerMeta(playersMap.get(image.id)),
        aggregateScore: toDisplayScore(row?.aggregateScore ?? 0),
        confidence: row?.confidence ?? 0,
        effectiveVoterWeight: row?.effectiveVoterWeight ?? 0,
        rankPosition: row?.rankPosition ?? Number.MAX_SAFE_INTEGER,
        totalComparisons: comparisonsByImage.get(image.id) ?? 0,
        viewerWins: 0,
        viewerLosses: 0,
        viewerComparisons: 0,
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

  const response: SharedLeaderboardResponse = { leaderboard };
  writeSharedLeaderboardCache(response);
  return response;
}

const AVATAR_VOTE_THRESHOLD = 10;

export interface BaddestTeam {
  abbr: string;
  avgRating: number;
  playerCount: number;
}

export async function getUserLeaderboard(
  db: DatabaseLike,
  username: string,
): Promise<{
  avatarImageId: string | null;
  baddestTeam: BaddestTeam | null;
  leaderboard: Array<{
    comparisons: number;
    confidence: number;
    image: { id: string };
    losses: number;
    player: PlayerMeta | null;
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
  const [personalState, userState, playersMap, globalAverages, baddestTeamRow] =
    await Promise.all([
      listPersonalImageState(db, user.id),
      getUserState(db, user.id),
      loadPlayersMap(db, images.map((image) => image.id)),
      getGlobalImageRatingAverages(db),
      getBaddestTeamForUser(db, user.id),
    ]);
  const personalStateMap = new Map(personalState.map((row) => [row.image_id, row]));
  const totalVotesCast = userState?.total_votes_cast ?? 0;
  const avatarImageId =
    totalVotesCast >= AVATAR_VOTE_THRESHOLD
      ? await getTopRatedImageIdForUser(db, user.id)
      : null;
  const baddestTeam: BaddestTeam | null =
    totalVotesCast >= AVATAR_VOTE_THRESHOLD && baddestTeamRow
      ? {
          abbr: baddestTeamRow.team,
          avgRating: baddestTeamRow.avg_rating,
          playerCount: baddestTeamRow.player_count,
        }
      : null;

  const leaderboard = images
    .map((image) => {
      const row = personalStateMap.get(image.id);
      // Pre-seed unvoted images with the crowd's average personal
      // rating, not 1200. This means a new user's leaderboard reflects
      // consensus from vote 1 and gradually drifts toward their taste,
      // instead of being a wall of 1200s with one player at 1216.
      const seededRating = globalAverages.get(image.id) ?? 1200;
      return {
        image: { id: image.id },
        player: toPlayerMeta(playersMap.get(image.id)),
        rating: row?.rating ?? seededRating,
        comparisons: row?.comparisons ?? 0,
        wins: row?.wins ?? 0,
        losses: row?.losses ?? 0,
        confidence: row?.confidence ?? 0,
        // ISO timestamp of the user's most recent compare against this
        // player. Used as a final tiebreak so the most recently
        // voted-on player floats to the top of any rating cluster.
        // Stripped before the API response.
        lastComparedAt: row?.last_compared_at ?? null,
        rankPosition: 0,
      };
    })
    .sort(
      // Tiebreak rating ties so a barely-seen player can't land at #1
      // by virtue of a low NBA personId. More personal comparisons +
      // more wins, then most recent vote first, then id as a final
      // stable fallback.
      (left, right) => {
        const leftTs = left.lastComparedAt
          ? new Date(left.lastComparedAt).getTime()
          : 0;
        const rightTs = right.lastComparedAt
          ? new Date(right.lastComparedAt).getTime()
          : 0;
        return (
          right.rating - left.rating ||
          right.comparisons - left.comparisons ||
          right.wins - left.wins ||
          right.confidence - left.confidence ||
          rightTs - leftTs ||
          left.image.id.localeCompare(right.image.id)
        );
      },
    )
    .map((row, index) => {
      const { lastComparedAt: _lastComparedAt, ...rest } = row;
      return { ...rest, rankPosition: index + 1 };
    });

  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    summary: {
      totalVotesCast,
      rankingConfidence: userState?.ranking_confidence ?? 0,
    },
    avatarImageId,
    baddestTeam,
    leaderboard,
  };
}

export interface VoterSummary {
  username: string;
  totalVotesCast: number;
  avatarImageId: string | null;
  baddestTeam: BaddestTeam | null;
}

export async function getVoters(
  db: DatabaseLike,
): Promise<{ voters: VoterSummary[] }> {
  const [users, allUserStates] = await Promise.all([
    listUsers(db),
    listAllUserStates(db),
  ]);
  const stateByUserId = new Map(
    allUserStates.map((state) => [state.user_id, state]),
  );
  const eligible = users.filter(
    (user) =>
      isPublicVoter(user.role) &&
      isVisibleUser(user.username) &&
      (stateByUserId.get(user.id)?.total_votes_cast ?? 0) > 0,
  );

  const voterRows = await Promise.all(
    eligible.map(async (user) => {
      const totalVotesCast =
        stateByUserId.get(user.id)?.total_votes_cast ?? 0;
      const eligibleForAvatar = totalVotesCast >= AVATAR_VOTE_THRESHOLD;
      const [avatarImageId, baddestTeamRow] = await Promise.all([
        eligibleForAvatar
          ? getTopRatedImageIdForUser(db, user.id)
          : Promise.resolve(null),
        eligibleForAvatar
          ? getBaddestTeamForUser(db, user.id)
          : Promise.resolve(null),
      ]);
      const baddestTeam: BaddestTeam | null = baddestTeamRow
        ? {
            abbr: baddestTeamRow.team,
            avgRating: baddestTeamRow.avg_rating,
            playerCount: baddestTeamRow.player_count,
          }
        : null;
      return {
        username: user.username,
        totalVotesCast,
        avatarImageId,
        baddestTeam,
      };
    }),
  );

  return {
    voters: voterRows.sort(
      (a, b) =>
        b.totalVotesCast - a.totalVotesCast ||
        a.username.localeCompare(b.username),
    ),
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
