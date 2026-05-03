// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  flushStoredQueuedActionsMock,
  getUserLeaderboardMock,
  loadCurrentUserMock,
} = vi.hoisted(() => ({
  flushStoredQueuedActionsMock: vi.fn(),
  getUserLeaderboardMock: vi.fn(),
  loadCurrentUserMock: vi.fn(),
}));

vi.mock("../lib/session", () => ({
  loadCurrentUser: loadCurrentUserMock,
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>(
    "../lib/api",
  );

  return {
    ...actual,
    getUserLeaderboard: getUserLeaderboardMock,
  };
});

vi.mock("../lib/voteQueueSync", () => ({
  flushStoredQueuedActions: flushStoredQueuedActionsMock,
}));

import UserLeaderboardPage from "./UserLeaderboardPage";
import {
  clearLeaderboardCache,
  userLeaderboardCacheKey,
  writeLeaderboardCache,
} from "../lib/leaderboardCache";

async function flushAsync(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function renderPage(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/users/riley"]}>
        <Routes>
          <Route element={<UserLeaderboardPage />} path="/users/:username" />
        </Routes>
      </MemoryRouter>,
    );
  });

  return { container, root };
}

describe("UserLeaderboardPage", () => {
  beforeEach(() => {
    loadCurrentUserMock.mockResolvedValue({
      id: "viewer-1",
      role: "user",
      username: "warren",
    });
    flushStoredQueuedActionsMock.mockResolvedValue(1);
    getUserLeaderboardMock.mockResolvedValue({
      user: {
        id: "user-2",
        role: "user",
        username: "riley",
      },
      summary: {
        rankingConfidence: 0.62,
        totalVotesCast: 12,
      },
      leaderboard: [
        {
          comparisons: 4,
          confidence: 0.45,
          image: { id: "LISA" },
          losses: 1,
          rankPosition: 1,
          rating: 1212.4,
          wins: 3,
        },
      ],
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    clearLeaderboardCache();
    vi.clearAllMocks();
  });

  it("flushes pending queued votes before loading a user leaderboard", async () => {
    const { container, root } = renderPage();

    await flushAsync();

    expect(container.textContent).toContain("riley");
    expect(flushStoredQueuedActionsMock).toHaveBeenCalledWith("viewer-1");
    expect(flushStoredQueuedActionsMock.mock.invocationCallOrder[0]).toBeLessThan(
      getUserLeaderboardMock.mock.invocationCallOrder[0],
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders a fresh cached user leaderboard without refetching immediately", async () => {
    flushStoredQueuedActionsMock.mockResolvedValue(0);
    writeLeaderboardCache(userLeaderboardCacheKey("riley"), {
      rows: [
        {
          confidence: 0.55,
          image: { id: "Cached Riley" },
          rankPosition: 1,
          score: "1510.0",
          wins: 8,
        },
      ],
      summary: {
        rankingConfidence: 0.77,
        totalVotesCast: 25,
      },
      title: "riley",
    });

    const { container, root } = renderPage();

    await flushAsync();

    expect(container.textContent).toContain("Cached Riley");
    expect(container.textContent).toContain("25");
    expect(getUserLeaderboardMock).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
