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
  role: "admin" | "user";
}

export interface MeDto {
  user: SessionUserDto;
}

export interface PlayerMetaDto {
  first: string;
  last: string;
  team: string | null;
  teamFull: string | null;
  jersey: string | null;
  pos: string | null;
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
  leaderboard: UserLeaderboardEntryDto[];
}

export const NBA_HEADSHOT_LARGE = (id: string) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`;
export const NBA_HEADSHOT_SMALL = (id: string) =>
  `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
