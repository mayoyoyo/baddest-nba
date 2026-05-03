import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("vercel config", () => {
  it("keeps legacy api paths rewritten onto the grouped hobby-safe functions", () => {
    const config = JSON.parse(
      readFileSync(`${root}/vercel.json`, "utf8"),
    ) as {
      rewrites?: Array<{ destination: string; source: string }>;
    };

    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        { source: "/api/login", destination: "/api/auth?action=login" },
        { source: "/api/signup", destination: "/api/auth?action=signup" },
        { source: "/api/logout", destination: "/api/auth?action=logout" },
        { source: "/api/me", destination: "/api/auth?action=me" },
        { source: "/api/actions/flush", destination: "/api/flush-actions" },
        { source: "/api/leaderboard/shared", destination: "/api/shared-leaderboard" },
        { source: "/api/images/:imageId", destination: "/api/image?imageId=:imageId" },
        {
          source: "/api/users/:username/leaderboard",
          destination: "/api/user-leaderboard?username=:username",
        },
      ]),
    );
  });
});
