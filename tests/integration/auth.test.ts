import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const jsonHeaders = {
  "content-type": "application/json",
};

describe("auth", () => {
  it("blocks signup when signups are temporarily closed", async () => {
    (env as { SIGNUPS_OPEN: string }).SIGNUPS_OPEN = "false";

    const response = await exports.default.fetch("http://example.com/api/signup", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        username: "closedsignup",
        pin: "1234",
        turnstileToken: "ok",
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Signups are temporarily closed",
    });

    const user = await env.DB
      .prepare("SELECT username FROM users WHERE username = ? LIMIT 1")
      .bind("closedsignup")
      .first<{ username: string }>();

    expect(user).toBeNull();
    (env as { SIGNUPS_OPEN: string }).SIGNUPS_OPEN = "true";
  });

  it("signs up a user with username and pin", async () => {
    const response = await exports.default.fetch("http://example.com/api/signup", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        username: "warren",
        pin: "1234",
        turnstileToken: "ok",
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      user: {
        username: "warren",
        role: "user",
      },
    });
    expect(response.headers.get("set-cookie")).toContain("session=");

    const user = await env.DB
      .prepare("SELECT username FROM users WHERE username = ? LIMIT 1")
      .bind("warren")
      .first<{ username: string }>();

    expect(user?.username).toBe("warren");
  });

  it("locks repeated failed logins", async () => {
    await exports.default.fetch("http://example.com/api/signup", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        username: "warren",
        pin: "1234",
        turnstileToken: "ok",
      }),
    });

    let status = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await exports.default.fetch(
        "http://example.com/api/login",
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            username: "warren",
            pin: "0000",
            turnstileToken: "ok",
          }),
        },
      );

      status = response.status;
    }

    expect(status).toBe(429);
  });
});
