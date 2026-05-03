import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const expectedApiEntrypoints = [
  "api/auth.ts",
  "api/admin/images/upload.ts",
  "api/flush-actions.ts",
  "api/health.ts",
  "api/image.ts",
  "api/me/leaderboard.ts",
  "api/pair.ts",
  "api/pair/skip.ts",
  "api/people.ts",
  "api/shared-leaderboard.ts",
  "api/user-leaderboard.ts",
  "api/vote.ts",
];

describe("vercel api entrypoints", () => {
  it("keeps explicit Vercel function files for the production API routes", () => {
    const missing = expectedApiEntrypoints.filter(
      (relativePath) => !existsSync(join(root, relativePath)),
    );

    expect(missing).toEqual([]);
  });
});
