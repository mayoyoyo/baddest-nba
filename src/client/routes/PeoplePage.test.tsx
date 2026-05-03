// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  flushStoredQueuedActionsMock,
  getPeopleMock,
  loadCurrentUserMock,
} = vi.hoisted(() => ({
  flushStoredQueuedActionsMock: vi.fn(),
  getPeopleMock: vi.fn(),
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
    getPeople: getPeopleMock,
  };
});

vi.mock("../lib/voteQueueSync", () => ({
  flushStoredQueuedActions: flushStoredQueuedActionsMock,
}));

import PeoplePage from "./PeoplePage";
import {
  clearLeaderboardCache,
  peopleCacheKey,
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
      <MemoryRouter initialEntries={["/people"]}>
        <PeoplePage />
      </MemoryRouter>,
    );
  });

  return { container, root };
}

describe("PeoplePage", () => {
  beforeEach(() => {
    loadCurrentUserMock.mockResolvedValue({
      id: "viewer-1",
      role: "user",
      username: "warren",
    });
    getPeopleMock.mockResolvedValue({
      users: [
        {
          summary: {
            rankingConfidence: 0.62,
            totalVotesCast: 12,
          },
          username: "riley",
        },
        {
          summary: {
            rankingConfidence: 0.31,
            totalVotesCast: 4,
          },
          username: "warren",
        },
      ],
    });
    flushStoredQueuedActionsMock.mockResolvedValue(2);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    clearLeaderboardCache();
    vi.clearAllMocks();
  });

  it("shows people with links to their personal leaderboards", async () => {
    const { container, root } = renderPage();

    await flushAsync();

    expect(container.textContent).toContain("People");
    expect(container.textContent).toContain("riley");
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("62%");
    expect(container.textContent).not.toContain("View leaderboard");
    expect(container.textContent).not.toContain("Leaderboard");

    const rileyRow = Array.from(
      container.querySelectorAll(".leaderboard-table tbody tr"),
    ).find((row) => row.textContent?.includes("riley"));
    expect(rileyRow?.getAttribute("role")).toBe("link");
    expect(rileyRow?.getAttribute("tabindex")).toBe("0");

    act(() => {
      root.unmount();
    });
  });

  it("flushes pending queued votes before loading people", async () => {
    const { root } = renderPage();

    await flushAsync();

    expect(flushStoredQueuedActionsMock).toHaveBeenCalledWith("viewer-1");
    expect(flushStoredQueuedActionsMock.mock.invocationCallOrder[0]).toBeLessThan(
      getPeopleMock.mock.invocationCallOrder[0],
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders a fresh cached people table without refetching immediately", async () => {
    flushStoredQueuedActionsMock.mockResolvedValue(0);
    writeLeaderboardCache(peopleCacheKey(), {
      users: [
        {
          summary: {
            rankingConfidence: 0.81,
            totalVotesCast: 42,
          },
          username: "cached-user",
        },
      ],
    });

    const { container, root } = renderPage();

    await flushAsync();

    expect(container.textContent).toContain("cached-user");
    expect(container.textContent).toContain("42");
    expect(getPeopleMock).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
