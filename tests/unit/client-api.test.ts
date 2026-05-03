import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteAdminImage,
  flushQueuedActions,
  getMe,
  searchAdminImages,
  getSharedLeaderboard,
  getUserLeaderboard,
  login,
  logout,
  signup,
  uploadAdminImage,
} from "../../src/client/lib/api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("client api routes", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the grouped auth endpoint for signup", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: "user-1",
          role: "user",
          username: "warren",
        },
      }),
    );

    await expect(signup({ username: "warren", pin: "1234" })).resolves.toMatchObject({
      user: {
        username: "warren",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth?action=signup",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
  });

  it("uses the grouped auth endpoint for login, logout, and session lookup", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: "user-1", role: "user", username: "warren" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ user: { id: "user-1", role: "user", username: "warren" } }));

    await login({ username: "warren", pin: "1234" });
    await logout();
    await getMe();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth?action=login",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth?action=logout",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/auth?action=me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("uses the flat shared leaderboard path directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ leaderboard: [] }));

    await expect(getSharedLeaderboard()).resolves.toEqual({
      leaderboard: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shared-leaderboard",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the flat user leaderboard path directly", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        leaderboard: [],
        summary: {
          rankingConfidence: 0,
          totalVotesCast: 0,
        },
        user: {
          id: "user-1",
          role: "user",
          username: "warren",
        },
      }),
    );

    await expect(getUserLeaderboard("warren")).resolves.toMatchObject({
      user: {
        username: "warren",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user-leaderboard?username=warren",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the flat flush actions path directly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ flushedCount: 1 }));

    await expect(
      flushQueuedActions([
        {
          id: "vote-1",
          kind: "vote",
          loserImageId: "loser",
          winnerImageId: "winner",
        },
      ]),
    ).resolves.toEqual({ flushedCount: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/flush-actions",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
  });

  it("sends the compressed upload once and preserves the original source name", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ image: { id: "Ana de Armas" } }));

    const displayFile = new File(["display-image"], "Ana de Armas.jpg", {
      type: "image/jpeg",
    });

    await expect(
      uploadAdminImage({
        display: displayFile,
        height: 640,
        sourceName: "Ana de Armas.png",
        width: 480,
      }),
    ).resolves.toEqual({ image: { id: "Ana de Armas" } });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit).toMatchObject({
      credentials: "include",
      method: "POST",
    });

    const body = requestInit?.body;
    expect(body).toBeInstanceOf(FormData);

    const formData = body as FormData;
    expect(formData.get("original")).toBeNull();
    expect(formData.get("display")).toBe(displayFile);
    expect(formData.get("sourceName")).toBe("Ana de Armas.png");
    expect(formData.get("width")).toBe("480");
    expect(formData.get("height")).toBe("640");
  });

  it("searches and deletes admin images through the grouped admin endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ images: [{ id: "Jhene Aiko" }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(searchAdminImages("jhene")).resolves.toEqual({
      images: [{ id: "Jhene Aiko" }],
    });
    await expect(deleteAdminImage("Jhene Aiko")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/images/upload?action=search&query=jhene",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/images/upload?imageId=Jhene+Aiko",
      expect.objectContaining({
        credentials: "include",
        method: "DELETE",
      }),
    );
  });
});
