export interface ApiError extends Error {
  status: number;
  data: unknown;
}

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  const data = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const error = new Error(
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`),
    ) as ApiError;
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};

export interface SessionUserDto {
  id: string;
  username: string;
  role: "admin" | "user" | "guest";
}

export interface MeDto {
  user: SessionUserDto | null;
  totalVotesCast: number;
  avatarImageId: string | null;
  avatarTeam: string | null;
}

export const AVATAR_VOTE_THRESHOLD = 10;
export const PUBLIC_LEADERBOARD_TIER = 3;
export const ALL_NBA_ELIGIBILITY_FLOOR = 10;
export const ALL_NBA_TEAM_SIZE = 5;
export const ALL_NBA_TEAM_COUNT = 3;
export const ALL_STARS_PER_CONFERENCE = 14;

export type ConferenceDto = "East" | "West";

export interface PlayerMetaDto {
  first: string;
  last: string;
  team: string | null;
  teamFull: string | null;
  jersey: string | null;
  pos: string | null;
  conference: ConferenceDto | null;
}

export interface PairDto {
  left: { id: string };
  right: { id: string };
}

export interface PairResponseDto {
  pair: PairDto | null;
}

export interface VoteResponseDto {
  nextPair: PairDto | null;
}

export interface SharedLeaderboardEntryDto {
  image: { id: string };
  player: PlayerMetaDto | null;
  aggregateScore: number;
  confidence: number;
  effectiveVoterWeight: number;
  rankPosition: number;
  totalComparisons: number;
  wins: number;
}

export interface UserLeaderboardEntryDto {
  image: { id: string };
  player: PlayerMetaDto | null;
  rankPosition: number;
  rating: number;
  comparisons: number;
  wins: number;
  losses: number;
  confidence: number;
}

export interface UserLeaderboardResponseDto {
  user: SessionUserDto;
  summary: { totalVotesCast: number; rankingConfidence: number };
  avatarImageId: string | null;
  avatarTeam: string | null;
  leaderboard: UserLeaderboardEntryDto[];
}

export interface VoterDto {
  username: string;
  totalVotesCast: number;
  avatarImageId: string | null;
  avatarTeam: string | null;
}

export interface VotersResponseDto {
  voters: VoterDto[];
}

export const NBA_HEADSHOT_LARGE = (id: string) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`;
export const NBA_HEADSHOT_SMALL = (id: string) =>
  `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;

// ESPN serves clean transparent team logos by lowercase abbreviation.
export const NBA_TEAM_LOGO = (team: string) =>
  `https://a.espncdn.com/i/teamlogos/nba/500/${team.toLowerCase()}.png`;

export const CURRENT_SEASON_LABEL = "'25-'26";
