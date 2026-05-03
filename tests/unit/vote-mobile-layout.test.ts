import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("vote mobile layout", () => {
  it("keeps the head-to-head matchup in two columns on mobile", () => {
    const css = readFileSync(
      join(process.cwd(), "src/client/styles.css"),
      "utf8",
    );

    const mobileBlockStart = css.indexOf("@media (max-width: 760px)");
    const nextBlockStart = css.indexOf("@media (max-width: 480px)");

    expect(mobileBlockStart).toBeGreaterThanOrEqual(0);
    expect(nextBlockStart).toBeGreaterThan(mobileBlockStart);

    const mobileBlock = css.slice(mobileBlockStart, nextBlockStart);
    expect(mobileBlock).toContain(".pair-grid");
    expect(mobileBlock).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
  });
});
