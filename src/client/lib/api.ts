export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

export interface AuthResponse {
  user: SessionUser;
}

export interface PairPayload {
  pair: {
    left: { id: string };
    right: { id: string };
  } | null;
}

export interface SharedLeaderboardResponse {
  leaderboard: Array<{
    aggregateScore: number;
    confidence: number;
    effectiveVoterWeight: number;
    image: { id: string };
    rankPosition: number;
    wins: number;
  }>;
}

export interface UserLeaderboardResponse {
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
  user: SessionUser;
}

export interface PeopleResponse {
  users: Array<{
    summary: {
      rankingConfidence: number;
      totalVotesCast: number;
    };
    username: string;
  }>;
}

export interface UploadImageResponse {
  image: { id: string };
}

export interface AdminImageSearchResponse {
  images: Array<{ id: string }>;
}

export interface FlushQueuedActionVote {
  id: string;
  kind: "vote";
  loserImageId: string;
  winnerImageId: string;
}

export interface FlushQueuedActionSkip {
  id: string;
  kind: "skip";
  leftImageId: string;
  rightImageId: string;
}

export type FlushQueuedAction = FlushQueuedActionVote | FlushQueuedActionSkip;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface AuthRequest {
  username: string;
  pin: string;
}

function readApiError(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      readApiError(payload) ?? "Request failed",
    );
  }

  return payload as T;
}

function authBody(request: AuthRequest): string {
  return JSON.stringify({
    ...request,
    turnstileToken: "local-bypass",
  });
}

export function signup(request: AuthRequest): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth?action=signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: authBody(request),
  });
}

export function login(request: AuthRequest): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth?action=login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: authBody(request),
  });
}

export function logout(): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>("/api/auth?action=logout", {
    method: "POST",
  });
}

export function getMe(): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth?action=me");
}

export function getPair(): Promise<PairPayload> {
  return requestJson<PairPayload>("/api/pair");
}

export function castVote(input: {
  loserImageId: string;
  winnerImageId: string;
}): Promise<{ nextPair: PairPayload["pair"] }> {
  return requestJson<{ nextPair: PairPayload["pair"] }>("/api/vote", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export function skipPair(input: {
  leftImageId: string;
  rightImageId: string;
}): Promise<{ nextPair: PairPayload["pair"] }> {
  return requestJson<{ nextPair: PairPayload["pair"] }>("/api/pair/skip", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export function flushQueuedActions(
  actions: FlushQueuedAction[],
  init?: RequestInit,
): Promise<{ flushedCount: number }> {
  return requestJson<{ flushedCount: number }>("/api/flush-actions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ actions }),
    ...init,
  });
}

export function getSharedLeaderboard(): Promise<SharedLeaderboardResponse> {
  return requestJson<SharedLeaderboardResponse>("/api/shared-leaderboard");
}

export function getUserLeaderboard(
  username: string,
): Promise<UserLeaderboardResponse> {
  const params = new URLSearchParams({ username });
  return requestJson<UserLeaderboardResponse>(
    `/api/user-leaderboard?${params.toString()}`,
  );
}

export function getPeople(): Promise<PeopleResponse> {
  return requestJson<PeopleResponse>("/api/people");
}

export async function uploadAdminImage(input: {
  display: File;
  height: number;
  replaceImageId?: string;
  original?: File;
  sourceName?: string;
  width: number;
}): Promise<UploadImageResponse> {
  const formData = new FormData();
  if (input.original) {
    formData.append("original", input.original);
  }
  formData.append("display", input.display);
  if (input.sourceName) {
    formData.append("sourceName", input.sourceName);
  }
  if (input.replaceImageId) {
    formData.append("replaceImageId", input.replaceImageId);
  }
  formData.append("width", String(input.width));
  formData.append("height", String(input.height));

  return requestJson<UploadImageResponse>("/api/admin/images/upload", {
    method: "POST",
    body: formData,
  });
}

export function searchAdminImages(
  query: string,
): Promise<AdminImageSearchResponse> {
  const params = new URLSearchParams({
    action: "search",
    query,
  });

  return requestJson<AdminImageSearchResponse>(
    `/api/admin/images/upload?${params.toString()}`,
    {
      method: "GET",
    },
  );
}

export function deleteAdminImage(
  imageId: string,
): Promise<{ ok: true }> {
  const params = new URLSearchParams({ imageId });

  return requestJson<{ ok: true }>(
    `/api/admin/images/upload?${params.toString()}`,
    {
      method: "DELETE",
    },
  );
}
