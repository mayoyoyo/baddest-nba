import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("leaderboard mobile table scrolling", () => {
  it("lets leaderboard tables pan sideways on mobile", () => {
    const css = readFileSync(
      join(process.cwd(), "src/client/styles.css"),
      "utf8",
    );

    const tableWrapStart = css.indexOf(".table-wrap");
    const leaderboardTableStart = css.indexOf(".leaderboard-table");

    expect(tableWrapStart).toBeGreaterThanOrEqual(0);
    expect(leaderboardTableStart).toBeGreaterThan(tableWrapStart);

    const tableWrapBlock = css.slice(tableWrapStart, leaderboardTableStart);
    expect(tableWrapBlock).toContain("overflow-x: auto;");
    expect(tableWrapBlock).not.toContain("touch-action: pan-x;");
    expect(tableWrapBlock).toContain("touch-action: pan-x pan-y;");

    const leaderboardCellsStart = css.indexOf(".leaderboard-table th,");
    expect(leaderboardCellsStart).toBeGreaterThan(leaderboardTableStart);

    const leaderboardTableBlock = css.slice(
      leaderboardTableStart,
      leaderboardCellsStart,
    );
    expect(leaderboardTableBlock).toContain("min-width: 640px;");
  });
});
