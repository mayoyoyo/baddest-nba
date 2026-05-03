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

async function clearImages() {
  await env.DB.prepare("DELETE FROM images").run();
}

function buildUploadFormData(
  fileName = "Ana de Armas.jpg",
  options?: { includeOriginal?: boolean; sourceName?: string },
) {
  const form = new FormData();
  if (options?.includeOriginal !== false) {
    form.append(
      "original",
      new File(["original-image"], fileName, { type: "image/jpeg" }),
    );
  }
  form.append(
    "display",
    new File(["display-image"], fileName, { type: "image/jpeg" }),
  );
  if (options?.sourceName) {
    form.append("sourceName", options.sourceName);
  }
  form.append("width", "480");
  form.append("height", "640");
  return form;
}

describe("upload flow", () => {
  it("rejects upload for non-admin users", async () => {
    const signup = await signupUser("viewer");

    const response = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: signup.cookie,
        },
        body: buildUploadFormData(),
      },
    );

    expect(response.status).toBe(403);
  });

  it("uploads an image for admins and serves the protected display asset", async () => {
    await clearImages();

    const admin = await signupUser("admin");
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(admin.user.id)
      .run();

    const uploadResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: buildUploadFormData(),
      },
    );

    expect(uploadResponse.status).toBe(201);
    const uploadPayload = (await uploadResponse.json()) as {
      image: { id: string };
    };
    expect(uploadPayload.image.id).toBe("Ana de Armas");

    const storedImage = await env.DB
      .prepare("SELECT mime_type FROM images WHERE id = ? LIMIT 1")
      .bind(uploadPayload.image.id)
      .first<{ mime_type: string }>();
    expect(storedImage?.mime_type).toBe("image/jpeg");

    const imageResponse = await exports.default.fetch(
      `http://example.com/api/images/${uploadPayload.image.id}`,
      {
        headers: {
          cookie: admin.cookie,
        },
      },
    );

    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toContain("image/jpeg");
    const imageBytes = await imageResponse.arrayBuffer();
    expect(new TextDecoder().decode(imageBytes)).toBe("display-image");

    const flatImageResponse = await exports.default.fetch(
      `http://example.com/api/image?imageId=${encodeURIComponent(uploadPayload.image.id)}`,
      {
        headers: {
          cookie: admin.cookie,
        },
      },
    );

    expect(flatImageResponse.status).toBe(200);
    expect(flatImageResponse.headers.get("content-type")).toContain("image/jpeg");
    const flatImageBytes = await flatImageResponse.arrayBuffer();
    expect(new TextDecoder().decode(flatImageBytes)).toBe("display-image");
  });

  it("uploads an image for admins with only the compressed display file", async () => {
    await clearImages();

    const admin = await signupUser("adminsolo");
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(admin.user.id)
      .run();

    const uploadResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: buildUploadFormData("display-copy.jpg", {
          includeOriginal: false,
          sourceName: "Pam Grier.png",
        }),
      },
    );

    expect(uploadResponse.status).toBe(201);
    const uploadPayload = (await uploadResponse.json()) as {
      image: { id: string };
    };
    expect(uploadPayload.image.id).toBe("Pam Grier");

    const imageResponse = await exports.default.fetch(
      `http://example.com/api/image?imageId=${encodeURIComponent(uploadPayload.image.id)}`,
      {
        headers: {
          cookie: admin.cookie,
        },
      },
    );

    expect(imageResponse.status).toBe(200);
    const imageBytes = await imageResponse.arrayBuffer();
    expect(new TextDecoder().decode(imageBytes)).toBe("display-image");
  });

  it("uploads an image for admins when the source name contains accented characters", async () => {
    await clearImages();

    const admin = await signupUser("adminaccent");
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(admin.user.id)
      .run();

    const uploadResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: buildUploadFormData("display-copy.jpg", {
          includeOriginal: false,
          sourceName: "Jhene\u0301 Aiko.png",
        }),
      },
    );

    expect(uploadResponse.status).toBe(201);
    const uploadPayload = (await uploadResponse.json()) as {
      image: { id: string };
    };
    expect(uploadPayload.image.id).toBe("Jhene\u0301 Aiko");

    const storedImage = await env.DB
      .prepare(
        "SELECT r2_key_original, r2_key_display FROM images WHERE id = ? LIMIT 1",
      )
      .bind(uploadPayload.image.id)
      .first<{ r2_key_display: string; r2_key_original: string }>();
    expect(storedImage?.r2_key_original).toMatch(
      /^images\/[0-9a-f-]+\/original$/,
    );
    expect(storedImage?.r2_key_display).toMatch(
      /^images\/[0-9a-f-]+\/display$/,
    );

    const imageResponse = await exports.default.fetch(
      `http://example.com/api/image?imageId=${encodeURIComponent(uploadPayload.image.id)}`,
      {
        headers: {
          cookie: admin.cookie,
        },
      },
    );

    expect(imageResponse.status).toBe(200);
    const imageBytes = await imageResponse.arrayBuffer();
    expect(new TextDecoder().decode(imageBytes)).toBe("display-image");
  });

  it("auto-replaces an existing image for admins when the filename matches", async () => {
    await clearImages();

    const admin = await signupUser("adminreplace");
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(admin.user.id)
      .run();

    const firstResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: buildUploadFormData("Mila Kunis.jpg"),
      },
    );

    expect(firstResponse.status).toBe(201);
    const firstPayload = (await firstResponse.json()) as {
      image: { id: string };
    };
    expect(firstPayload.image.id).toBe("Mila Kunis");

    const replaceForm = new FormData();
    replaceForm.append(
      "display",
      new File(["replacement-display-image"], "mila_kunis.png", {
        type: "image/png",
      }),
    );
    replaceForm.append("sourceName", "mila_kunis.png");
    replaceForm.append("width", "900");
    replaceForm.append("height", "1200");

    const replaceResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: replaceForm,
      },
    );

    expect(replaceResponse.status).toBe(200);
    const replacePayload = (await replaceResponse.json()) as {
      image: { id: string };
    };
    expect(replacePayload.image.id).toBe("Mila Kunis");

    const imageCount = await env.DB
      .prepare("SELECT COUNT(*) AS count FROM images WHERE id = ?")
      .bind("Mila Kunis")
      .first<{ count: number }>();
    expect(imageCount?.count).toBe(1);

    const storedImage = await env.DB
      .prepare(
        "SELECT width, height, mime_type FROM images WHERE id = ? LIMIT 1",
      )
      .bind("Mila Kunis")
      .first<{ height: number; mime_type: string; width: number }>();
    expect(storedImage).toEqual({
      width: 900,
      height: 1200,
      mime_type: "image/png",
    });

    const imageResponse = await exports.default.fetch(
      "http://example.com/api/image?imageId=Mila%20Kunis",
      {
        headers: {
          cookie: admin.cookie,
        },
      },
    );

    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toContain("image/png");
    const imageBytes = await imageResponse.arrayBuffer();
    expect(new TextDecoder().decode(imageBytes)).toBe(
      "replacement-display-image",
    );
  });

  it("auto-replaces an existing image for admins when the source filename is a fuzzy variant", async () => {
    await clearImages();

    const admin = await signupUser("adminfuzzyreplace");
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(admin.user.id)
      .run();

    const firstResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: buildUploadFormData("Jhene\u0301 Aiko.jpg"),
      },
    );

    expect(firstResponse.status).toBe(201);
    const firstPayload = (await firstResponse.json()) as {
      image: { id: string };
    };
    expect(firstPayload.image.id).toBe("Jhene\u0301 Aiko");

    const replaceForm = new FormData();
    replaceForm.append(
      "display",
      new File(["replacement-display-image"], "jhene-aiko-(1).webp", {
        type: "image/webp",
      }),
    );
    replaceForm.append("sourceName", "jhene-aiko-(1).webp");
    replaceForm.append("width", "900");
    replaceForm.append("height", "1200");

    const replaceResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: replaceForm,
      },
    );

    expect(replaceResponse.status).toBe(200);
    const replacePayload = (await replaceResponse.json()) as {
      image: { id: string };
    };
    expect(replacePayload.image.id).toBe("Jhene\u0301 Aiko");

    const imageCount = await env.DB
      .prepare("SELECT COUNT(*) AS count FROM images WHERE id = ?")
      .bind("Jhene\u0301 Aiko")
      .first<{ count: number }>();
    expect(imageCount?.count).toBe(1);

    const imageResponse = await exports.default.fetch(
      `http://example.com/api/image?imageId=${encodeURIComponent("Jhene\u0301 Aiko")}`,
      {
        headers: {
          cookie: admin.cookie,
        },
      },
    );

    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toContain("image/webp");
    const imageBytes = await imageResponse.arrayBuffer();
    expect(new TextDecoder().decode(imageBytes)).toBe(
      "replacement-display-image",
    );
  });

  it("auto-replaces an existing image for admins when the source filename has a small typo", async () => {
    await clearImages();

    const admin = await signupUser("admintyposafe");
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(admin.user.id)
      .run();

    const firstResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: buildUploadFormData("Ella Langley.jpg"),
      },
    );

    expect(firstResponse.status).toBe(201);

    const replaceForm = new FormData();
    replaceForm.append(
      "display",
      new File(["replacement-display-image"], "ella langgley.jpg", {
        type: "image/jpeg",
      }),
    );
    replaceForm.append("sourceName", "ella langgley.jpg");
    replaceForm.append("width", "900");
    replaceForm.append("height", "1200");

    const replaceResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: replaceForm,
      },
    );

    expect(replaceResponse.status).toBe(200);
    const replacePayload = (await replaceResponse.json()) as {
      image: { id: string };
    };
    expect(replacePayload.image.id).toBe("Ella Langley");
  });

  it("rejects fuzzy replacement when the typo is ambiguous across multiple ids", async () => {
    await clearImages();

    const admin = await signupUser("admintyposambiguous");
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(admin.user.id)
      .run();

    for (const [index, imageId] of ["Ella Langley", "Ella Langkley"].entries()) {
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
          `images/${index}/original`,
          `images/${index}/display`,
          480,
          640,
          "image/jpeg",
          index,
          "active",
          admin.user.id,
          "2026-04-17T00:00:00.000Z",
        )
        .run();
    }

    const replaceForm = new FormData();
    replaceForm.append(
      "display",
      new File(["replacement-display-image"], "ella langgley.jpg", {
        type: "image/jpeg",
      }),
    );
    replaceForm.append("sourceName", "ella langgley.jpg");
    replaceForm.append("width", "900");
    replaceForm.append("height", "1200");

    const replaceResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: replaceForm,
      },
    );

    expect(replaceResponse.status).toBe(400);
    expect(await replaceResponse.json()).toEqual({
      error: "Filename matches multiple existing image ids",
    });
  });

  it("searches uploaded images by partial id for admins", async () => {
    await clearImages();

    const admin = await signupUser("adminsearch");
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(admin.user.id)
      .run();

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
        "Jhene Aiko",
        "images/1/original",
        "images/1/display",
        480,
        640,
        "image/jpeg",
        0,
        "active",
        admin.user.id,
        "2026-04-17T00:00:00.000Z",
      )
      .run();

    const response = await exports.default.fetch(
      "http://example.com/api/admin/images/upload?action=search&query=jhene",
      {
        headers: {
          cookie: admin.cookie,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      images: [{ id: "Jhene Aiko" }],
    });
  });

  it("hard deletes an uploaded image and related ranking state for admins", async () => {
    await clearImages();

    const admin = await signupUser("admindelete");
    await env.DB
      .prepare("UPDATE users SET role = 'admin' WHERE id = ?")
      .bind(admin.user.id)
      .run();

    const uploadResponse = await exports.default.fetch(
      "http://example.com/api/admin/images/upload",
      {
        method: "POST",
        headers: {
          cookie: admin.cookie,
        },
        body: buildUploadFormData("Delete Me.jpg"),
      },
    );

    expect(uploadResponse.status).toBe(201);
    const uploadPayload = (await uploadResponse.json()) as {
      image: { id: string };
    };

    await env.DB
      .prepare(
        `
          INSERT INTO personal_image_state (
            user_id,
            image_id,
            rating,
            comparisons,
            wins,
            losses,
            confidence,
            last_compared_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(admin.user.id, uploadPayload.image.id, 1200, 1, 1, 0, 0.5, null)
      .run();
    await env.DB
      .prepare(
        `
          INSERT INTO shared_image_state (
            image_id,
            aggregate_score,
            rank_position,
            effective_voter_weight,
            confidence,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(uploadPayload.image.id, 1300, 1, 1, 0.5, "2026-04-17T00:00:00.000Z")
      .run();

    const deleteResponse = await exports.default.fetch(
      `http://example.com/api/admin/images/upload?imageId=${encodeURIComponent(uploadPayload.image.id)}`,
      {
        method: "DELETE",
        headers: {
          cookie: admin.cookie,
        },
      },
    );

    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ ok: true });

    const storedImage = await env.DB
      .prepare("SELECT id FROM images WHERE id = ? LIMIT 1")
      .bind(uploadPayload.image.id)
      .first<{ id: string }>();
    expect(storedImage).toBeNull();

    const personalState = await env.DB
      .prepare(
        "SELECT image_id FROM personal_image_state WHERE image_id = ? LIMIT 1",
      )
      .bind(uploadPayload.image.id)
      .first<{ image_id: string }>();
    expect(personalState).toBeNull();

    const sharedState = await env.DB
      .prepare(
        "SELECT image_id FROM shared_image_state WHERE image_id = ? LIMIT 1",
      )
      .bind(uploadPayload.image.id)
      .first<{ image_id: string }>();
    expect(sharedState).toBeNull();
  });
});
