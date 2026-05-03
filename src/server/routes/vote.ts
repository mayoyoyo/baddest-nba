import { Hono, type Context } from "hono";
import { requireAuth } from "../lib/auth.js";
import { getDb } from "../lib/runtime.js";
import type { AppEnv } from "../types.js";
import {
  flushQueuedActionsForUser,
  getNextPairForUser,
  recordVoteForUser,
  skipPairForUser,
  type FlushActionInput,
} from "../services/voteService.js";

const voteRoutes = new Hono<AppEnv>();

function isFlushActionInput(value: unknown): value is FlushActionInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<FlushActionInput>;
  if (typeof candidate.id !== "string" || typeof candidate.kind !== "string") {
    return false;
  }

  if (candidate.kind === "vote") {
    return (
      typeof candidate.winnerImageId === "string" &&
      typeof candidate.loserImageId === "string"
    );
  }

  if (candidate.kind === "skip") {
    return (
      typeof candidate.leftImageId === "string" &&
      typeof candidate.rightImageId === "string"
    );
  }

  return false;
}

voteRoutes.get("/pair", requireAuth, async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const pair = await getNextPairForUser(getDb(c), viewer.user.id);
  return c.json({ pair });
});

voteRoutes.post("/pair/skip", requireAuth, async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = (await c.req.json().catch(() => null)) as
    | {
        leftImageId?: unknown;
        rightImageId?: unknown;
      }
    | null;

  if (
    !payload ||
    typeof payload.leftImageId !== "string" ||
    typeof payload.rightImageId !== "string"
  ) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  try {
    const result = await skipPairForUser(getDb(c), viewer.user.id, {
      leftImageId: payload.leftImageId,
      rightImageId: payload.rightImageId,
    });
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to skip matchup",
      },
      400,
    );
  }
});

async function handleFlushActions(c: Context<AppEnv>) {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = (await c.req.json().catch(() => null)) as
    | {
        actions?: unknown;
      }
    | null;

  if (
    !payload ||
    !Array.isArray(payload.actions) ||
    !payload.actions.every((action) => isFlushActionInput(action))
  ) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  try {
    return c.json(
      await flushQueuedActionsForUser(getDb(c), viewer.user.id, payload.actions),
    );
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to flush actions",
      },
      400,
    );
  }
}

voteRoutes.post("/flush-actions", requireAuth, handleFlushActions);
voteRoutes.post("/actions/flush", requireAuth, handleFlushActions);

voteRoutes.post("/vote", requireAuth, async (c) => {
  const viewer = c.get("viewer");
  if (!viewer) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = (await c.req.json().catch(() => null)) as
    | {
        winnerImageId?: unknown;
        loserImageId?: unknown;
      }
    | null;

  if (
    !payload ||
    typeof payload.winnerImageId !== "string" ||
    typeof payload.loserImageId !== "string"
  ) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  try {
    const result = await recordVoteForUser(getDb(c), viewer.user.id, {
      winnerImageId: payload.winnerImageId,
      loserImageId: payload.loserImageId,
    });
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to record vote",
      },
      400,
    );
  }
});

export default voteRoutes;
