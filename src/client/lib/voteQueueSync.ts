import { flushQueuedActions, type FlushQueuedAction } from "./api";
import { readQueuedActions, writeQueuedActions } from "./voteSession";

function buildFlushedIdSet(actions: FlushQueuedAction[]): Set<string> {
  return new Set(actions.map((action) => action.id));
}

export async function flushStoredQueuedActions(userId: string): Promise<number> {
  const snapshot = readQueuedActions(userId);
  if (snapshot.length === 0) {
    return 0;
  }

  await flushQueuedActions(snapshot);

  const flushedIds = buildFlushedIdSet(snapshot);
  const remaining = readQueuedActions(userId).filter(
    (action) => !flushedIds.has(action.id),
  );
  writeQueuedActions(userId, remaining);

  return snapshot.length;
}

export function sendQueuedActionsBeacon(actions: FlushQueuedAction[]): boolean {
  if (
    actions.length === 0 ||
    typeof navigator === "undefined" ||
    typeof navigator.sendBeacon !== "function"
  ) {
    return false;
  }

  const body = new Blob([JSON.stringify({ actions })], {
    type: "application/json",
  });

  return navigator.sendBeacon("/api/flush-actions", body);
}
