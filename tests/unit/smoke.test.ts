import { describe, expect, it } from "vitest";
import app from "../../src/server/app";

describe("server smoke", () => {
  it("exposes a health endpoint", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
  });
});
