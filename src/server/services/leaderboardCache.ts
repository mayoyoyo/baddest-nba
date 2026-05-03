// In-memory cache for the shared leaderboard.
//
// Why a cache: every read currently loads listActiveImages +
// listUsers + listAllPersonalImageState + listAllUserStates and runs
// the full O(N_users * N_images) aggregation. With a single container
// on Fly we can serve hot reads from memory and pay the DB cost at
// most once per TTL window.
//
// Invalidation strategy: time-based (60s) plus an explicit hook the
// vote service calls after each vote. Time-based covers the case
// where multiple machines drift; the explicit invalidation keeps the
// reading-after-your-own-vote experience snappy in single-machine
// mode.

const TTL_MS = 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

let entry: CacheEntry<unknown> | null = null;

export function readSharedLeaderboardCache<T>(): T | null {
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }
  return entry.value as T;
}

export function writeSharedLeaderboardCache<T>(value: T): void {
  entry = {
    value,
    expiresAt: Date.now() + TTL_MS,
  };
}

export function invalidateSharedLeaderboardCache(): void {
  entry = null;
}
