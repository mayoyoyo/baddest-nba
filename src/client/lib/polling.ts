export function startPolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
): () => void {
  let inFlight = false;

  const runCallback = async () => {
    if (inFlight) {
      return;
    }

    inFlight = true;

    try {
      await callback();
    } finally {
      inFlight = false;
    }
  };

  const tick = () => {
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    void runCallback();
  };

  const handleVisibilityChange = () => {
    if (typeof document !== "undefined" && !document.hidden) {
      void runCallback();
    }
  };

  const intervalId = window.setInterval(tick, intervalMs);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
