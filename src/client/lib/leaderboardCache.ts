interface LeaderboardCacheEntry<T> {
  data: T;
  dirty: boolean;
  updatedAt: number;
}

const leaderboardCache = new Map<string, LeaderboardCacheEntry<unknown>>();

export const SHARED_LEADERBOARD_CACHE_TTL_MS = 10_000;
export const USER_LEADERBOARD_CACHE_TTL_MS = 15_000;
export const PEOPLE_CACHE_TTL_MS = 15_000;
export const LEADERBOARD_POLL_INTERVAL_MS = 15_000;

export function sharedLeaderboardCacheKey(): string {
  return "shared";
}

export function peopleCacheKey(): string {
  return "people";
}

export function userLeaderboardCacheKey(username: string): string {
  return `user:${username}`;
}

export function readLeaderboardCache<T>(
  key: string,
): LeaderboardCacheEntry<T> | null {
  const entry = leaderboardCache.get(key);
  if (!entry) {
    return null;
  }

  return entry as LeaderboardCacheEntry<T>;
}

export function writeLeaderboardCache<T>(key: string, data: T): void {
  leaderboardCache.set(key, {
    data,
    dirty: false,
    updatedAt: Date.now(),
  });
}

export function shouldRefreshLeaderboardCache<T>(
  entry: LeaderboardCacheEntry<T> | null,
  maxAgeMs: number,
): boolean {
  if (!entry) {
    return true;
  }

  if (entry.dirty) {
    return true;
  }

  return Date.now() - entry.updatedAt >= maxAgeMs;
}

export function markLeaderboardCacheDirty(key: string): void {
  const entry = leaderboardCache.get(key);
  if (!entry) {
    return;
  }

  leaderboardCache.set(key, {
    ...entry,
    dirty: true,
  });
}

export function invalidateVoteAffectedLeaderboardCaches(
  username: string,
): void {
  markLeaderboardCacheDirty(sharedLeaderboardCacheKey());
  markLeaderboardCacheDirty(peopleCacheKey());
  markLeaderboardCacheDirty(userLeaderboardCacheKey(username));
}

export function clearLeaderboardCache(): void {
  leaderboardCache.clear();
}
