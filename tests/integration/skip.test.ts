import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

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

async function seedImages(uploadedBy: string, prefix: string, count = 3) {
  for (const [index, imageId] of Array.from({ length: count }, (_, imageIndex) =>
    `${prefix}-img-${imageIndex + 1}`,
  ).entries()) {
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

function normalizePairKey(left: string, right: string): string {
  return [left, right].sort().join(":");
}

describe("skip flow", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM vote_events"),
      env.DB.prepare("DELETE FROM personal_image_state"),
      env.DB.prepare("DELETE FROM shared_image_state"),
      env.DB.prepare("DELETE FROM user_state"),
      env.DB.prepare("DELETE FROM images"),
      env.DB.prepare("DELETE FROM sessions"),
      env.DB.prepare("DELETE FROM users"),
    ]);
  });

  it("returns a different next pair without recording a vote", async () => {
    const signup = await signupUser("skipper");
    await seedImages(signup.user.id, "skip");

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

    const skipResponse = await exports.default.fetch(
      "http://example.com/api/pair/skip",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          cookie: signup.cookie,
        },
        body: JSON.stringify({
          leftImageId: pairPayload.pair.left.id,
          rightImageId: pairPayload.pair.right.id,
        }),
      },
    );

    expect(skipResponse.status).toBe(200);
    const skipPayload = (await skipResponse.json()) as {
      nextPair: {
        left: { id: string };
        right: { id: string };
      } | null;
    };

    expect(skipPayload.nextPair).not.toBeNull();
    expect(
      normalizePairKey(
        skipPayload.nextPair?.left.id ?? "",
        skipPayload.nextPair?.right.id ?? "",
      ),
    ).not.toBe(normalizePairKey(pairPayload.pair.left.id, pairPayload.pair.right.id));

    const votes = await env.DB
      .prepare("SELECT COUNT(*) AS vote_count FROM vote_events")
      .first<{ vote_count: number }>();
    expect(votes?.vote_count).toBe(0);

    const userState = await env.DB
      .prepare(
        "SELECT total_votes_cast, recent_pair_cache FROM user_state WHERE user_id = ? LIMIT 1",
      )
      .bind(signup.user.id)
      .first<{ recent_pair_cache: string; total_votes_cast: number }>();
    expect(userState?.total_votes_cast).toBe(0);
    expect(userState?.recent_pair_cache).toContain(pairPayload.pair.left.id);
    expect(userState?.recent_pair_cache).toContain(pairPayload.pair.right.id);
  });

  it("deprioritizes skipped images when a fully fresh matchup is available", async () => {
    const signup = await signupUser("skipfresh");
    await seedImages(signup.user.id, "skipfresh", 4);

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

    expect(
      normalizePairKey(pairPayload.pair.left.id, pairPayload.pair.right.id),
    ).toBe("skipfresh-img-1:skipfresh-img-2");

    const skipResponse = await exports.default.fetch(
      "http://example.com/api/pair/skip",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          cookie: signup.cookie,
        },
        body: JSON.stringify({
          leftImageId: pairPayload.pair.left.id,
          rightImageId: pairPayload.pair.right.id,
        }),
      },
    );

    expect(skipResponse.status).toBe(200);
    const skipPayload = (await skipResponse.json()) as {
      nextPair: {
        left: { id: string };
        right: { id: string };
      } | null;
    };

    expect(skipPayload.nextPair).not.toBeNull();
    expect(
      normalizePairKey(
        skipPayload.nextPair?.left.id ?? "",
        skipPayload.nextPair?.right.id ?? "",
      ),
    ).toBe("skipfresh-img-3:skipfresh-img-4");
  });

  it("keeps moving to untouched images across repeated skips when they are available", async () => {
    const signup = await signupUser("skiprotate");
    await seedImages(signup.user.id, "skiprotate", 6);

    const firstPairResponse = await exports.default.fetch("http://example.com/api/pair", {
      headers: {
        cookie: signup.cookie,
      },
    });
    expect(firstPairResponse.status).toBe(200);

    const firstPairPayload = (await firstPairResponse.json()) as {
      pair: {
        left: { id: string };
        right: { id: string };
      };
    };
    expect(
      normalizePairKey(firstPairPayload.pair.left.id, firstPairPayload.pair.right.id),
    ).toBe("skiprotate-img-1:skiprotate-img-2");

    const firstSkipResponse = await exports.default.fetch(
      "http://example.com/api/pair/skip",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          cookie: signup.cookie,
        },
        body: JSON.stringify({
          leftImageId: firstPairPayload.pair.left.id,
          rightImageId: firstPairPayload.pair.right.id,
        }),
      },
    );
    expect(firstSkipResponse.status).toBe(200);

    const firstSkipPayload = (await firstSkipResponse.json()) as {
      nextPair: {
        left: { id: string };
        right: { id: string };
      } | null;
    };
    expect(firstSkipPayload.nextPair).not.toBeNull();
    expect(
      normalizePairKey(
        firstSkipPayload.nextPair?.left.id ?? "",
        firstSkipPayload.nextPair?.right.id ?? "",
      ),
    ).toBe("skiprotate-img-3:skiprotate-img-4");

    const secondSkipResponse = await exports.default.fetch(
      "http://example.com/api/pair/skip",
      {
        method: "POST",
        headers: {
          ...jsonHeaders,
          cookie: signup.cookie,
        },
        body: JSON.stringify({
          leftImageId: firstSkipPayload.nextPair?.left.id,
          rightImageId: firstSkipPayload.nextPair?.right.id,
        }),
      },
    );
    expect(secondSkipResponse.status).toBe(200);

    const secondSkipPayload = (await secondSkipResponse.json()) as {
      nextPair: {
        left: { id: string };
        right: { id: string };
      } | null;
    };
    expect(secondSkipPayload.nextPair).not.toBeNull();
    expect(
      normalizePairKey(
        secondSkipPayload.nextPair?.left.id ?? "",
        secondSkipPayload.nextPair?.right.id ?? "",
      ),
    ).toBe("skiprotate-img-5:skiprotate-img-6");
  });
});
