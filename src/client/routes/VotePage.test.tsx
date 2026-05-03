// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  castVoteMock,
  flushQueuedActionsMock,
  getUserLeaderboardMock,
  loadCurrentUserMock,
  preloadImageIdsMock,
  skipPairMock,
} = vi.hoisted(() => ({
  castVoteMock: vi.fn(),
  flushQueuedActionsMock: vi.fn(),
  getUserLeaderboardMock: vi.fn(),
  loadCurrentUserMock: vi.fn(),
  preloadImageIdsMock: vi.fn(),
  skipPairMock: vi.fn(),
}));

vi.mock("../lib/session", () => ({
  clearCurrentUser: vi.fn(),
  loadCurrentUser: loadCurrentUserMock,
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>(
    "../lib/api",
  );

  return {
    ...actual,
    castVote: castVoteMock,
    flushQueuedActions: flushQueuedActionsMock,
    getUserLeaderboard: getUserLeaderboardMock,
    logout: vi.fn(),
    skipPair: skipPairMock,
  };
});

vi.mock("../lib/imagePrep", async () => {
  const actual = await vi.importActual<typeof import("../lib/imagePrep")>(
    "../lib/imagePrep",
  );

  return {
    ...actual,
    preloadImageIds: preloadImageIdsMock,
  };
});

import VotePage from "./VotePage";

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
      <MemoryRouter initialEntries={["/vote"]}>
        <VotePage />
      </MemoryRouter>,
    );
  });

  return { container, root };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("VotePage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    vi.useFakeTimers();
    loadCurrentUserMock.mockResolvedValue({
      id: "user-1",
      role: "user",
      username: "warren",
    });
    getUserLeaderboardMock.mockResolvedValue({
      user: {
        id: "user-1",
        role: "user",
        username: "warren",
      },
      summary: {
        rankingConfidence: 0,
        totalVotesCast: 0,
      },
      leaderboard: [
        {
          comparisons: 0,
          confidence: 0,
          image: { id: "alpha" },
          losses: 0,
          rankPosition: 1,
          rating: 1200,
          wins: 0,
        },
        {
          comparisons: 0,
          confidence: 0,
          image: { id: "beta" },
          losses: 0,
          rankPosition: 2,
          rating: 1200,
          wins: 0,
        },
        {
          comparisons: 0,
          confidence: 0,
          image: { id: "gamma" },
          losses: 0,
          rankPosition: 3,
          rating: 1200,
          wins: 0,
        },
      ],
    });
    castVoteMock.mockReset();
    flushQueuedActionsMock.mockReset();
    skipPairMock.mockReset();
    preloadImageIdsMock.mockReset();
    preloadImageIdsMock.mockResolvedValue(undefined);
    flushQueuedActionsMock.mockResolvedValue({ flushedCount: 1 });
    localStorage.clear();
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: vi.fn(() => true),
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("shows the vote page heading as baddest in the game", async () => {
    const { container, root } = renderPage();

    await flushAsync();

    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Baddest in the game");

    act(() => {
      root.unmount();
    });
  });

  it("switches matchups locally and flushes queued votes in the background", async () => {
    const { container, root } = renderPage();
    await flushAsync();
    expect(preloadImageIdsMock).toHaveBeenCalledWith(["gamma"]);
    const initialPreloadCalls = preloadImageIdsMock.mock.calls.length;

    const buttons = Array.from(container.querySelectorAll("button"));
    const chooseLeftButton = buttons.find((button) =>
      button.textContent?.includes("alpha"),
    );
    expect(chooseLeftButton).toBeDefined();

    await act(async () => {
      chooseLeftButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(castVoteMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("gamma");
    expect(container.textContent).not.toContain("beta");
    expect(preloadImageIdsMock.mock.calls.length).toBeGreaterThan(initialPreloadCalls);

    await act(async () => {
      vi.advanceTimersByTime(7_000);
      await Promise.resolve();
    });

    expect(flushQueuedActionsMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          kind: "vote",
          winnerImageId: "alpha",
          loserImageId: "beta",
        }),
      ],
      undefined,
    );

    act(() => {
      root.unmount();
    });
  });

  it("keeps skip local until the background flush runs", async () => {
    const { container, root } = renderPage();
    await flushAsync();
    expect(preloadImageIdsMock).toHaveBeenCalledWith(["gamma"]);
    const initialPreloadCalls = preloadImageIdsMock.mock.calls.length;

    const skipButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Skip matchup"),
    );
    expect(skipButton).toBeDefined();

    await act(async () => {
      skipButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(skipPairMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("gamma");
    expect(container.textContent).not.toContain("beta");
    expect(preloadImageIdsMock.mock.calls.length).toBeGreaterThan(initialPreloadCalls);

    await act(async () => {
      vi.advanceTimersByTime(7_000);
      await Promise.resolve();
    });

    expect(flushQueuedActionsMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          kind: "skip",
          leftImageId: "alpha",
          rightImageId: "beta",
        }),
      ],
      undefined,
    );
 
    act(() => {
      root.unmount();
    });
  });

  it("preloads speculative matchups eagerly even when idle callbacks are supported", async () => {
    const idleCallbacks: IdleRequestCallback[] = [];

    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }),
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      value: vi.fn(),
    });

    const { container, root } = renderPage();
    await flushAsync();

    expect(preloadImageIdsMock).toHaveBeenCalledWith(["gamma"]);
    preloadImageIdsMock.mockClear();

    const chooseLeftButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("alpha"),
    );
    expect(chooseLeftButton).toBeDefined();

    await act(async () => {
      chooseLeftButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(preloadImageIdsMock).toHaveBeenCalledTimes(1);
    expect(idleCallbacks).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("flushes queued actions when the vote page unmounts", async () => {
    const { container, root } = renderPage();
    await flushAsync();

    const buttons = Array.from(container.querySelectorAll("button"));
    const chooseLeftButton = buttons.find((button) =>
      button.textContent?.includes("alpha"),
    );
    expect(chooseLeftButton).toBeDefined();

    await act(async () => {
      chooseLeftButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(flushQueuedActionsMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });

    expect(flushQueuedActionsMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          kind: "vote",
          winnerImageId: "alpha",
          loserImageId: "beta",
        }),
      ],
      expect.objectContaining({ keepalive: true }),
    );
  });

  it("flushes queued actions on pagehide with keepalive", async () => {
    const { container, root } = renderPage();
    await flushAsync();

    const buttons = Array.from(container.querySelectorAll("button"));
    const chooseLeftButton = buttons.find((button) =>
      button.textContent?.includes("alpha"),
    );
    expect(chooseLeftButton).toBeDefined();

    await act(async () => {
      chooseLeftButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    expect(flushQueuedActionsMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          kind: "vote",
          winnerImageId: "alpha",
          loserImageId: "beta",
        }),
      ],
      expect.objectContaining({ keepalive: true }),
    );

    act(() => {
      root.unmount();
    });
  });

  it("flushes immediately when six actions are queued", async () => {
    const { container, root } = renderPage();
    await flushAsync();

    const clickCurrentLeftChoice = async () => {
      const chooseLeftButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("alpha") ||
        button.textContent?.includes("beta") ||
        button.textContent?.includes("gamma"),
      );
      expect(chooseLeftButton).toBeDefined();
      await act(async () => {
        chooseLeftButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
    };

    for (let index = 0; index < 5; index += 1) {
      await clickCurrentLeftChoice();
    }

    expect(flushQueuedActionsMock).not.toHaveBeenCalled();

    await clickCurrentLeftChoice();

    expect(flushQueuedActionsMock).toHaveBeenCalledTimes(1);
    expect(flushQueuedActionsMock.mock.calls[0][0]).toHaveLength(6);

    act(() => {
      root.unmount();
    });
  });

  it("sends a beacon with queued actions on pagehide", async () => {
    const { container, root } = renderPage();
    await flushAsync();

    const buttons = Array.from(container.querySelectorAll("button"));
    const chooseLeftButton = buttons.find((button) =>
      button.textContent?.includes("alpha"),
    );
    expect(chooseLeftButton).toBeDefined();

    await act(async () => {
      chooseLeftButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    expect(navigator.sendBeacon).toHaveBeenCalled();
    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      "/api/flush-actions",
      expect.any(Blob),
    );

    act(() => {
      root.unmount();
    });
  });

  it("does not flush the same queued actions twice across pagehide and unmount", async () => {
    const { container, root } = renderPage();
    await flushAsync();

    const chooseLeftButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("alpha"),
    );
    expect(chooseLeftButton).toBeDefined();

    await act(async () => {
      chooseLeftButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });

    expect(flushQueuedActionsMock).toHaveBeenCalledTimes(1);
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });
});
