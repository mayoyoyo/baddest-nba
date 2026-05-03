// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startPolling } from "../../src/client/lib/polling";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("startPolling overlap protection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start a second callback while the previous one is still running", async () => {
    const firstRun = deferred();
    const callback = vi.fn(() => firstRun.promise);

    const stopPolling = startPolling(callback, 5_000);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(callback).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(callback).toHaveBeenCalledTimes(1);

    firstRun.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(callback).toHaveBeenCalledTimes(2);

    stopPolling();
  });
});
