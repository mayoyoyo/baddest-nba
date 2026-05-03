import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const jsonHeaders = {
  "content-type": "application/json",
};

async function signupUser(username: string) {
  const response = await exports.default.fetch("http://example.com/api/signup", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      username,
      pin: "1234",
      turnstileToken: "ok",
    }),
  });

  const payload = (await response.json()) as {
    user: { id: string; username: string };
  };

  return {
    cookie: response.headers.get("set-cookie") ?? "",
    user: payload.user,
  };
}

async function seedImages(
  uploadedBy: string,
  prefix: string,
  imageIds = [`${prefix}-img-1`, `${prefix}-img-2`, `${prefix}-img-3`],
) {
  for (const [index, imageId] of imageIds.entries()) {
    await env.DB
      .prepare(
        `
          INSERT INTO images (
            id,
            r2_key_original,
            r2_key_display,
            width,
            height,
            mime_type,
            sort_order,
            status,
            uploaded_by,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        imageId,
        `${imageId}-original`,
        `${imageId}-display`,
        1200,
        1600,
        "image/jpeg",
        index,
        "active",
        uploadedBy,
        "2026-04-17T00:00:00.000Z",
      )
      .run();
  }
}

describe("leaderboards", () => {
  it("returns the shared leaderboard ordered by aggregate score", async () => {
    const signup = await signupUser("warren");
    await seedImages(signup.user.id, "shared");

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: signup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "shared-img-1",
        loserImageId: "shared-img-2",
      }),
    });

    const response = await exports.default.fetch(
      "http://example.com/api/leaderboard/shared",
      {
        headers: {
          cookie: signup.cookie,
        },
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      leaderboard: Array<{ image: { id: string }; wins: number }>;
    };
    expect(payload.leaderboard[0]?.image.id).toBe("shared-img-1");
    expect(payload.leaderboard[0]?.wins).toBe(1);
  });

  it("returns the shared leaderboard from a flat api path", async () => {
    const signup = await signupUser("flatshared");
    await seedImages(signup.user.id, "flatshared");

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: signup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "flatshared-img-1",
        loserImageId: "flatshared-img-2",
      }),
    });

    const response = await exports.default.fetch(
      "http://example.com/api/shared-leaderboard",
      {
        headers: {
          cookie: signup.cookie,
        },
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      leaderboard: Array<{ image: { id: string } }>;
    };
    const flatRows = payload.leaderboard.filter((row) =>
      row.image.id.startsWith("flatshared-"),
    );
    expect(flatRows[0]?.image.id).toBe("flatshared-img-1");
  });

  it("returns a user leaderboard with votes and confidence summary", async () => {
    const signup = await signupUser("riley");
    await seedImages(signup.user.id, "personal");

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: signup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "personal-img-1",
        loserImageId: "personal-img-2",
      }),
    });

    const response = await exports.default.fetch(
      `http://example.com/api/users/${signup.user.username}/leaderboard`,
      {
        headers: {
          cookie: signup.cookie,
        },
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      user: { username: string };
      summary: { totalVotesCast: number };
      leaderboard: Array<{ image: { id: string } }>;
    };
    expect(payload.user.username).toBe("riley");
    expect(payload.summary.totalVotesCast).toBe(1);
    expect(payload.leaderboard[0]?.image.id).toBe("personal-img-1");
  });

  it("returns the signed-in user's leaderboard from a flat api path", async () => {
    const signup = await signupUser("flatuser");
    await seedImages(signup.user.id, "flatuser");

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: signup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "flatuser-img-1",
        loserImageId: "flatuser-img-2",
      }),
    });

    const response = await exports.default.fetch(
      "http://example.com/api/me/leaderboard",
      {
        headers: {
          cookie: signup.cookie,
        },
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      user: { username: string };
      leaderboard: Array<{ image: { id: string } }>;
    };
    expect(payload.user.username).toBe("flatuser");
    expect(payload.leaderboard[0]?.image.id).toBe("flatuser-img-1");
  });

  it("returns a named user's leaderboard from a flat query api path", async () => {
    const signup = await signupUser("queryuser");
    await seedImages(signup.user.id, "queryuser");

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: signup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "queryuser-img-1",
        loserImageId: "queryuser-img-2",
      }),
    });

    const response = await exports.default.fetch(
      `http://example.com/api/user-leaderboard?username=${signup.user.username}`,
      {
        headers: {
          cookie: signup.cookie,
        },
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      user: { username: string };
      leaderboard: Array<{ image: { id: string } }>;
    };
    expect(payload.user.username).toBe("queryuser");
    expect(payload.leaderboard[0]?.image.id).toBe("queryuser-img-1");
  });

  it("returns viewable people with leaderboard summary stats", async () => {
    const viewerSignup = await signupUser("peopleviewer");
    const voterSignup = await signupUser("peopleriley");
    await seedImages(viewerSignup.user.id, "people", ["people-img-1", "people-img-2"]);

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: voterSignup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "people-img-1",
        loserImageId: "people-img-2",
      }),
    });

    const response = await exports.default.fetch("http://example.com/api/people", {
      headers: {
        cookie: viewerSignup.cookie,
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      users: Array<{
        summary: { rankingConfidence: number; totalVotesCast: number };
        username: string;
      }>;
    };
    const createdUsers = payload.users.filter((user) =>
      ["peopleviewer", "peopleriley"].includes(user.username),
    );
    expect(createdUsers.map((user) => user.username)).toEqual([
      "peopleriley",
      "peopleviewer",
    ]);
    expect(createdUsers[0]?.summary.totalVotesCast).toBe(1);
    expect(createdUsers[0]?.summary.rankingConfidence).toBeGreaterThan(0);
    expect(createdUsers[1]?.summary.totalVotesCast).toBe(0);
  });

  it("excludes generated test users from people and shared leaderboard totals", async () => {
    const visibleSignup = await signupUser("visibleperson");
    const generatedSignup = await signupUser("perf1776487554");
    const debugSignup = await signupUser("debugcheck");
    await seedImages(visibleSignup.user.id, "filteredshared");

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: visibleSignup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "filteredshared-img-1",
        loserImageId: "filteredshared-img-2",
      }),
    });

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: generatedSignup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "filteredshared-img-2",
        loserImageId: "filteredshared-img-1",
      }),
    });

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: debugSignup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "filteredshared-img-2",
        loserImageId: "filteredshared-img-1",
      }),
    });

    const peopleResponse = await exports.default.fetch("http://example.com/api/people", {
      headers: {
        cookie: visibleSignup.cookie,
      },
    });

    expect(peopleResponse.status).toBe(200);
    const peoplePayload = (await peopleResponse.json()) as {
      users: Array<{
        summary: { rankingConfidence: number; totalVotesCast: number };
        username: string;
      }>;
    };
    expect(
      peoplePayload.users.some((user) => user.username === "visibleperson"),
    ).toBe(true);
    expect(
      peoplePayload.users.some((user) => user.username === "perf1776487554"),
    ).toBe(false);
    expect(
      peoplePayload.users.some((user) => user.username === "debugcheck"),
    ).toBe(false);

    const sharedResponse = await exports.default.fetch(
      "http://example.com/api/shared-leaderboard",
      {
        headers: {
          cookie: visibleSignup.cookie,
        },
      },
    );

    expect(sharedResponse.status).toBe(200);
    const sharedPayload = (await sharedResponse.json()) as {
      leaderboard: Array<{
        image: { id: string };
        wins: number;
      }>;
    };
    const filteredRows = sharedPayload.leaderboard.filter((row) =>
      row.image.id.startsWith("filteredshared-"),
    );
    const rowByImageId = new Map(
      filteredRows.map((row) => [row.image.id, row]),
    );
    expect(rowByImageId.get("filteredshared-img-1")?.wins).toBe(1);
    expect(rowByImageId.get("filteredshared-img-2")?.wins).toBe(0);
  });

  it("recomputes the shared leaderboard when stored shared rows are missing", async () => {
    const signup = await signupUser("morgan");
    await seedImages(signup.user.id, "stale", [
      "stale-zeta",
      "stale-alpha",
      "stale-beta",
    ]);

    await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: signup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: "stale-zeta",
        loserImageId: "stale-alpha",
      }),
    });

    await env.DB.prepare("DELETE FROM shared_image_state").run();

    const response = await exports.default.fetch(
      "http://example.com/api/leaderboard/shared",
      {
        headers: {
          cookie: signup.cookie,
        },
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      leaderboard: Array<{
        aggregateScore: number;
        image: { id: string };
        wins: number;
      }>;
    };
    const staleRows = payload.leaderboard.filter((row) =>
      row.image.id.startsWith("stale-"),
    );
    expect(staleRows[0]?.image.id).toBe("stale-zeta");
    expect(staleRows[0]?.wins).toBe(1);
    expect(staleRows[0]?.aggregateScore).toBeGreaterThan(0);
  });
});
