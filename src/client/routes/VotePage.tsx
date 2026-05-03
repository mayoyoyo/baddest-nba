import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  NBA_HEADSHOT_LARGE,
  type ApiError,
  type PairDto,
  type PairResponseDto,
  type VoteResponseDto,
} from "@/lib/api";
import { cn } from "@/lib/cn";

const DELTA_REVEAL_MS = 700;

type AnimState =
  | { kind: "idle" }
  | {
      kind: "voting";
      winner: "left" | "right";
      delta?: { winner: number; loser: number };
    };

export default function VotePage() {
  const [pair, setPair] = useState<PairDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anim, setAnim] = useState<AnimState>({ kind: "idle" });
  const { refresh } = useAuth();

  const loadPair = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.get<PairResponseDto>("/api/pair");
      setPair(next.pair);
      refresh();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    loadPair();
  }, [loadPair]);

  const handleVote = useCallback(
    async (winner: "left" | "right") => {
      if (!pair || anim.kind === "voting") return;
      setAnim({ kind: "voting", winner });
      const winnerImageId = winner === "left" ? pair.left.id : pair.right.id;
      const loserImageId = winner === "left" ? pair.right.id : pair.left.id;
      try {
        const res = await api.post<VoteResponseDto>("/api/vote", {
          winnerImageId,
          loserImageId,
        });
        if (res.delta) {
          setAnim({ kind: "voting", winner, delta: res.delta });
        }
        await new Promise((r) => setTimeout(r, DELTA_REVEAL_MS));
        if (res.nextPair) {
          setPair(res.nextPair);
        } else {
          await loadPair();
        }
        refresh();
      } catch (err) {
        setError((err as ApiError).message);
      } finally {
        setAnim({ kind: "idle" });
      }
    },
    [pair, anim, loadPair, refresh],
  );

  const handleSkip = useCallback(async () => {
    if (!pair) return;
    try {
      const res = await api.post<{ nextPair: PairDto | null }>(
        "/api/pair/skip",
        {
          leftImageId: pair.left.id,
          rightImageId: pair.right.id,
        },
      );
      if (res.nextPair) {
        setPair(res.nextPair);
      } else {
        await loadPair();
      }
    } catch (err) {
      setError((err as ApiError).message);
    }
  }, [pair, loadPair]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") handleVote("left");
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") handleVote("right");
      else if (e.key.toLowerCase() === "s") handleSkip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleVote, handleSkip]);

  if (loading) {
    return <VoteScreenSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={loadPair}>Try again</Button>
        </div>
      </div>
    );
  }

  if (!pair) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h2 className="text-lg font-semibold">Nothing to vote on yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The roster hasn't been seeded — check back in a minute.
          </p>
        </div>
      </div>
    );
  }

  const leftDelta =
    anim.kind === "voting" && anim.delta
      ? anim.winner === "left"
        ? anim.delta.winner
        : anim.delta.loser
      : null;
  const rightDelta =
    anim.kind === "voting" && anim.delta
      ? anim.winner === "right"
        ? anim.delta.winner
        : anim.delta.loser
      : null;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-2 px-3 pb-2 pt-2 md:gap-3 md:px-6 md:py-4">
      <div className="shrink-0 text-center">
        <h2 className="text-sm font-semibold tracking-tight md:text-lg">
          Who's the baddest?
        </h2>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
        <PlayerCard
          imageId={pair.left.id}
          state={
            anim.kind === "voting"
              ? anim.winner === "left"
                ? "winner"
                : "loser"
              : "idle"
          }
          delta={leftDelta}
          onPick={() => handleVote("left")}
        />
        <PlayerCard
          imageId={pair.right.id}
          state={
            anim.kind === "voting"
              ? anim.winner === "right"
                ? "winner"
                : "loser"
              : "idle"
          }
          delta={rightDelta}
          onPick={() => handleVote("right")}
        />
      </div>

      <div className="flex shrink-0 justify-center">
        <Button
          variant="destructive"
          size="lg"
          className="h-11 w-full max-w-xs text-base font-semibold"
          onClick={handleSkip}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}

interface PlayerCardProps {
  imageId: string;
  state: "idle" | "winner" | "loser";
  delta: number | null;
  onPick: () => void;
}

function PlayerCard({ imageId, state, delta, onPick }: PlayerCardProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "group relative min-h-0 overflow-hidden rounded-2xl border bg-muted transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        state === "winner" && "scale-[1.02] ring-2 ring-primary",
        state === "loser" && "scale-95 opacity-50",
      )}
    >
      <img
        src={NBA_HEADSHOT_LARGE(imageId)}
        alt=""
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        draggable={false}
        loading="eager"
      />
      {delta !== null && (
        <span
          className={cn(
            "pointer-events-none absolute right-2 top-2 rounded-full px-2.5 py-1 text-base font-bold tabular-nums shadow-lg transition-transform duration-200",
            state === "winner"
              ? "bg-emerald-500 text-white"
              : "bg-rose-500 text-white",
          )}
        >
          {delta > 0 ? "+" : ""}
          {Math.round(delta)}
        </span>
      )}
    </button>
  );
}

function VoteScreenSkeleton() {
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-2 px-3 pb-2 pt-2 md:gap-3 md:px-6 md:py-4">
      <div className="shrink-0 text-center">
        <h2 className="text-sm font-semibold opacity-0 md:text-lg">.</h2>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
        <div className="animate-pulse rounded-2xl bg-muted" />
        <div className="animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="h-11 shrink-0" />
    </div>
  );
}
