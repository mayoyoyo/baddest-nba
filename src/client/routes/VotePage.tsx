import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  api,
  NBA_HEADSHOT_LARGE,
  type ApiError,
  type PairResponseDto,
  type VoteResponseDto,
} from "@/lib/api";
import { cn } from "@/lib/cn";

type AnimState =
  | { kind: "idle" }
  | { kind: "voting"; winner: "left" | "right" };

export default function VotePage() {
  const [pair, setPair] = useState<PairResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anim, setAnim] = useState<AnimState>({ kind: "idle" });

  const loadPair = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.get<PairResponseDto>("/api/pair");
      setPair(next);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.status === 401) {
        window.location.href = "/login";
        return;
      }
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPair();
  }, [loadPair]);

  const handleVote = useCallback(
    async (winner: "left" | "right") => {
      if (!pair?.pair || anim.kind === "voting") return;
      setAnim({ kind: "voting", winner });
      const winnerImageId =
        winner === "left" ? pair.pair.left.imageId : pair.pair.right.imageId;
      const loserImageId =
        winner === "left" ? pair.pair.right.imageId : pair.pair.left.imageId;
      try {
        const res = await api.post<VoteResponseDto>("/api/vote", {
          winnerImageId,
          loserImageId,
        });
        await new Promise((r) => setTimeout(r, 220));
        if (res.nextPair) {
          setPair(res.nextPair);
        } else {
          await loadPair();
        }
      } catch (err) {
        setError((err as ApiError).message);
      } finally {
        setAnim({ kind: "idle" });
      }
    },
    [pair, anim, loadPair],
  );

  const handleSkip = useCallback(async () => {
    if (!pair?.pair) return;
    try {
      const res = await api.post<{ nextPair: PairResponseDto | null }>(
        "/api/pair/skip",
        {
          leftImageId: pair.pair.left.imageId,
          rightImageId: pair.pair.right.imageId,
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

  // Keyboard shortcuts for desktop power voters.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") handleVote("left");
      else if (e.key === "ArrowRight") handleVote("right");
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
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" onClick={loadPair}>Try again</Button>
      </div>
    );
  }

  if (!pair?.pair) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h2 className="text-lg font-semibold">Nothing to vote on yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The roster hasn't been seeded — check back in a minute.
        </p>
      </div>
    );
  }

  const left = pair.pair.left.imageId;
  const right = pair.pair.right.imageId;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-4 md:py-8">
      <div className="text-center">
        <h2 className="text-base font-semibold tracking-tight md:text-lg">
          Who's the baddest?
        </h2>
        <p className="text-xs text-muted-foreground md:text-sm">
          Pick a face. {pair.user.totalVotesCast} votes cast.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <PlayerCard
          imageId={left}
          state={
            anim.kind === "voting"
              ? anim.winner === "left"
                ? "winner"
                : "loser"
              : "idle"
          }
          onPick={() => handleVote("left")}
        />
        <PlayerCard
          imageId={right}
          state={
            anim.kind === "voting"
              ? anim.winner === "right"
                ? "winner"
                : "loser"
              : "idle"
          }
          onPick={() => handleVote("right")}
        />
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={handleSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

interface PlayerCardProps {
  imageId: string;
  state: "idle" | "winner" | "loser";
  onPick: () => void;
}

function PlayerCard({ imageId, state, onPick }: PlayerCardProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "group relative aspect-[4/3] overflow-hidden rounded-2xl border bg-muted transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
    </button>
  );
}

function VoteScreenSkeleton() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-4 md:py-8">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
        <div className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
