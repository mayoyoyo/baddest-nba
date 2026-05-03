import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import app from "../../api/_app";

describe("vercel entry", () => {
  it("exports the Hono app from the shared Vercel api entry", () => {
    const source = readFileSync(
      new URL("../../api/_app.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain('export default app');
  });

  it("serves the Hono app through the shared Vercel entry", async () => {
    const response = await app.fetch(new Request("http://example.com/api/health"));

    expect(response.status).toBe(200);
  });
});
