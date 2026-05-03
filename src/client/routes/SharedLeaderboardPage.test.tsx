// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  flushStoredQueuedActionsMock,
  getSharedLeaderboardMock,
  loadCurrentUserMock,
} = vi.hoisted(() => ({
  flushStoredQueuedActionsMock: vi.fn(),
  getSharedLeaderboardMock: vi.fn(),
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
    getSharedLeaderboard: getSharedLeaderboardMock,
  };
});

vi.mock("../lib/voteQueueSync", () => ({
  flushStoredQueuedActions: flushStoredQueuedActionsMock,
}));

import SharedLeaderboardPage from "./SharedLeaderboardPage";
import {
  clearLeaderboardCache,
  sharedLeaderboardCacheKey,
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
      <MemoryRouter initialEntries={["/leaderboard"]}>
        <SharedLeaderboardPage />
      </MemoryRouter>,
    );
  });

  return { container, root };
}

describe("SharedLeaderboardPage", () => {
  beforeEach(() => {
    loadCurrentUserMock.mockResolvedValue({
      id: "viewer-1",
      role: "user",
      username: "warren",
    });
    flushStoredQueuedActionsMock.mockResolvedValue(3);
    getSharedLeaderboardMock.mockResolvedValue({
      leaderboard: [
        {
          aggregateScore: 1.42,
          confidence: 0.51,
          effectiveVoterWeight: 0.8,
          image: { id: "LISA" },
          rankPosition: 1,
          wins: 4,
        },
      ],
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    clearLeaderboardCache();
    vi.clearAllMocks();
  });

  it("flushes pending queued votes before loading the shared leaderboard", async () => {
    const { container, root } = renderPage();

    await flushAsync();

    expect(container.textContent).toContain("Shared leaderboard");
    expect(flushStoredQueuedActionsMock).toHaveBeenCalledWith("viewer-1");
    expect(flushStoredQueuedActionsMock.mock.invocationCallOrder[0]).toBeLessThan(
      getSharedLeaderboardMock.mock.invocationCallOrder[0],
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders a fresh cached shared leaderboard without refetching immediately", async () => {
    flushStoredQueuedActionsMock.mockResolvedValue(0);
    writeLeaderboardCache(sharedLeaderboardCacheKey(), {
      rows: [
        {
          confidence: 0.88,
          image: { id: "Cached Lisa" },
          rankPosition: 1,
          score: "9.99",
          wins: 99,
        },
      ],
    });

    const { container, root } = renderPage();

    await flushAsync();

    expect(container.textContent).toContain("Cached Lisa");
    expect(getSharedLeaderboardMock).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
