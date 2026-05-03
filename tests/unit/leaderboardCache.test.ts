import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLeaderboardCache,
  invalidateVoteAffectedLeaderboardCaches,
  peopleCacheKey,
  readLeaderboardCache,
  sharedLeaderboardCacheKey,
  shouldRefreshLeaderboardCache,
  userLeaderboardCacheKey,
  writeLeaderboardCache,
} from "../../src/client/lib/leaderboardCache";

describe("leaderboardCache", () => {
  beforeEach(() => {
    clearLeaderboardCache();
    vi.useRealTimers();
  });

  it("treats cached entries as fresh until their ttl expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T12:00:00.000Z"));

    writeLeaderboardCache(sharedLeaderboardCacheKey(), {
      rows: [{ image: { id: "LISA" }, rankPosition: 1 }],
    });

    const cachedEntry = readLeaderboardCache(sharedLeaderboardCacheKey());
    expect(cachedEntry?.data).toEqual({
      rows: [{ image: { id: "LISA" }, rankPosition: 1 }],
    });
    expect(shouldRefreshLeaderboardCache(cachedEntry, 10_000)).toBe(false);

    vi.advanceTimersByTime(10_001);

    expect(
      shouldRefreshLeaderboardCache(
        readLeaderboardCache(sharedLeaderboardCacheKey()),
        10_000,
      ),
    ).toBe(true);
  });

  it("invalidates shared, people, and the current user's leaderboard after votes flush", () => {
    writeLeaderboardCache(sharedLeaderboardCacheKey(), { rows: ["shared"] });
    writeLeaderboardCache(peopleCacheKey(), { users: ["people"] });
    writeLeaderboardCache(userLeaderboardCacheKey("warren"), {
      rows: ["warren"],
    });
    writeLeaderboardCache(userLeaderboardCacheKey("riley"), { rows: ["riley"] });

    invalidateVoteAffectedLeaderboardCaches("warren");

    expect(
      readLeaderboardCache(sharedLeaderboardCacheKey())?.dirty,
    ).toBe(true);
    expect(readLeaderboardCache(peopleCacheKey())?.dirty).toBe(true);
    expect(
      readLeaderboardCache(userLeaderboardCacheKey("warren"))?.dirty,
    ).toBe(true);
    expect(
      readLeaderboardCache(userLeaderboardCacheKey("riley"))?.dirty,
    ).toBe(false);
  });
});
