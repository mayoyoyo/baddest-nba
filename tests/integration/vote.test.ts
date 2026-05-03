import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const jsonHeaders = {
  "content-type": "application/json",
};

async function signupUser(username = "warren") {
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

async function seedImages(uploadedBy: string) {
  for (const [index, imageId] of ["img-1", "img-2", "img-3"].entries()) {
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

describe("vote flow", () => {
  it("writes one vote event and returns the next pair", async () => {
    const signup = await signupUser("warren");
    await seedImages(signup.user.id);

    const pairResponse = await exports.default.fetch("http://example.com/api/pair", {
      headers: {
        cookie: signup.cookie,
      },
    });

    expect(pairResponse.status).toBe(200);
    const pairPayload = (await pairResponse.json()) as {
      pair: {
        left: { id: string };
        right: { id: string };
      };
    };

    const voteResponse = await exports.default.fetch("http://example.com/api/vote", {
      method: "POST",
      headers: {
        ...jsonHeaders,
        cookie: signup.cookie,
      },
      body: JSON.stringify({
        winnerImageId: pairPayload.pair.left.id,
        loserImageId: pairPayload.pair.right.id,
      }),
    });

    expect(voteResponse.status).toBe(200);
    expect(await voteResponse.json()).toMatchObject({
      nextPair: {
        left: {
          id: expect.any(String),
        },
        right: {
          id: expect.any(String),
        },
      },
    });

    const votes = await env.DB
      .prepare("SELECT COUNT(*) AS vote_count FROM vote_events WHERE user_id = ?")
      .bind(signup.user.id)
      .first<{ vote_count: number }>();
    expect(votes?.vote_count).toBe(1);

    const personalRows = await env.DB
      .prepare(
        "SELECT COUNT(*) AS row_count FROM personal_image_state WHERE user_id = ?",
      )
      .bind(signup.user.id)
      .first<{ row_count: number }>();
    expect(personalRows?.row_count).toBe(2);

    const userState = await env.DB
      .prepare(
        "SELECT total_votes_cast FROM user_state WHERE user_id = ? LIMIT 1",
      )
      .bind(signup.user.id)
      .first<{ total_votes_cast: number }>();
    expect(userState?.total_votes_cast).toBe(1);
  });

  it("flushes queued vote and skip actions in one request", async () => {
    const signup = await signupUser("flushuser");
    const imageIds = [
      "flush-img-1",
      "flush-img-2",
      "flush-img-3",
      "flush-img-4",
    ];

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
          signup.user.id,
          "2026-04-17T00:00:00.000Z",
        )
        .run();
    }

    const flushResponse = await exports.default.fetch(
      "http://example.com/api/actions/flush",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          cookie: signup.cookie,
        },
        body: JSON.stringify({
          actions: [
            {
              id: "vote-action-1",
              kind: "vote",
              winnerImageId: "flush-img-1",
              loserImageId: "flush-img-2",
            },
            {
              id: "skip-action-1",
              kind: "skip",
              leftImageId: "flush-img-3",
              rightImageId: "flush-img-4",
            },
          ],
        }),
      },
    );

    expect(flushResponse.status).toBe(200);
    expect(await flushResponse.json()).toEqual({
      flushedCount: 2,
    });

    const votes = await env.DB
      .prepare("SELECT COUNT(*) AS vote_count FROM vote_events WHERE user_id = ?")
      .bind(signup.user.id)
      .first<{ vote_count: number }>();
    expect(votes?.vote_count).toBe(1);

    const userState = await env.DB
      .prepare(
        "SELECT total_votes_cast, recent_pair_cache FROM user_state WHERE user_id = ? LIMIT 1",
      )
      .bind(signup.user.id)
      .first<{ recent_pair_cache: string | null; total_votes_cast: number }>();
    expect(userState?.total_votes_cast).toBe(1);
    expect(userState?.recent_pair_cache).toContain("flush-img-3");
    expect(userState?.recent_pair_cache).toContain("flush-img-4");
  });

  it("flushes queued vote and skip actions through the flat hosted route", async () => {
    const signup = await signupUser("flushflatuser");
    const imageIds = [
      "flush-flat-img-1",
      "flush-flat-img-2",
      "flush-flat-img-3",
      "flush-flat-img-4",
    ];

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
          signup.user.id,
          "2026-04-17T00:00:00.000Z",
        )
        .run();
    }

    const flushResponse = await exports.default.fetch(
      "http://example.com/api/flush-actions",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          cookie: signup.cookie,
        },
        body: JSON.stringify({
          actions: [
            {
              id: "flat-vote-action-1",
              kind: "vote",
              winnerImageId: "flush-flat-img-1",
              loserImageId: "flush-flat-img-2",
            },
            {
              id: "flat-skip-action-1",
              kind: "skip",
              leftImageId: "flush-flat-img-3",
              rightImageId: "flush-flat-img-4",
            },
          ],
        }),
      },
    );

    expect(flushResponse.status).toBe(200);
    expect(await flushResponse.json()).toEqual({
      flushedCount: 2,
    });
  });

  it("stores nine recent matchups so exact pair cooldown lasts longer", async () => {
    const signup = await signupUser("cooldownuser");
    const imageIds = [
      "cool-1",
      "cool-2",
      "cool-3",
      "cool-4",
      "cool-5",
      "cool-6",
    ];

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
          signup.user.id,
          "2026-04-17T00:00:00.000Z",
        )
        .run();
    }

    const flushResponse = await exports.default.fetch(
      "http://example.com/api/flush-actions",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          cookie: signup.cookie,
        },
        body: JSON.stringify({
          actions: [
            {
              id: "cool-1",
              kind: "skip",
              leftImageId: "cool-1",
              rightImageId: "cool-2",
            },
            {
              id: "cool-2",
              kind: "skip",
              leftImageId: "cool-3",
              rightImageId: "cool-4",
            },
            {
              id: "cool-3",
              kind: "skip",
              leftImageId: "cool-5",
              rightImageId: "cool-6",
            },
            {
              id: "cool-4",
              kind: "skip",
              leftImageId: "cool-1",
              rightImageId: "cool-3",
            },
            {
              id: "cool-5",
              kind: "skip",
              leftImageId: "cool-2",
              rightImageId: "cool-4",
            },
            {
              id: "cool-6",
              kind: "skip",
              leftImageId: "cool-1",
              rightImageId: "cool-4",
            },
            {
              id: "cool-7",
              kind: "skip",
              leftImageId: "cool-2",
              rightImageId: "cool-5",
            },
            {
              id: "cool-8",
              kind: "skip",
              leftImageId: "cool-3",
              rightImageId: "cool-6",
            },
            {
              id: "cool-9",
              kind: "skip",
              leftImageId: "cool-4",
              rightImageId: "cool-5",
            },
          ],
        }),
      },
    );

    expect(flushResponse.status).toBe(200);

    const userState = await env.DB
      .prepare(
        "SELECT recent_pair_cache FROM user_state WHERE user_id = ? LIMIT 1",
      )
      .bind(signup.user.id)
      .first<{ recent_pair_cache: string | null }>();

    expect(JSON.parse(userState?.recent_pair_cache ?? "[]")).toEqual([
      ["cool-4", "cool-5"],
      ["cool-3", "cool-6"],
      ["cool-2", "cool-5"],
      ["cool-1", "cool-4"],
      ["cool-2", "cool-4"],
      ["cool-1", "cool-3"],
      ["cool-5", "cool-6"],
      ["cool-3", "cool-4"],
      ["cool-1", "cool-2"],
    ]);
  });
});
