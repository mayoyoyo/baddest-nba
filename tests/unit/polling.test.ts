// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startPolling } from "../../src/client/lib/polling";

describe("startPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips interval refreshes while the page is hidden and refreshes when visible again", () => {
    let hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });

    const callback = vi.fn();
    const stopPolling = startPolling(callback, 5_000);

    hidden = true;
    vi.advanceTimersByTime(5_000);
    expect(callback).not.toHaveBeenCalled();

    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(callback).toHaveBeenCalledTimes(1);

    stopPolling();
  });
});
