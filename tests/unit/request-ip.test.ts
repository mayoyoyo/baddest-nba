import { describe, expect, it } from "vitest";
import { getRequestIp } from "../../src/server/lib/auth";

describe("getRequestIp", () => {
  it("reads Cloudflare's client IP header when present", () => {
    const request = new Request("http://example.com", {
      headers: {
        "cf-connecting-ip": "203.0.113.1",
        "x-forwarded-for": "198.51.100.8",
      },
    });

    expect(getRequestIp(request)).toBe("203.0.113.1");
  });

  it("falls back to the first forwarded IP address", () => {
    const request = new Request("http://example.com", {
      headers: {
        "x-forwarded-for": "198.51.100.8, 198.51.100.9",
      },
    });

    expect(getRequestIp(request)).toBe("198.51.100.8");
  });
});
