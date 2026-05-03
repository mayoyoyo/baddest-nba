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

type AnimState =
  | { kind: "idle" }
  | { kind: "voting"; winner: "left" | "right" };

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
      // First /api/pair call may have created a guest cookie; sync /me.
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
        await new Promise((r) => setTimeout(r, 220));
        if (res.nextPair) {
          setPair(res.nextPair);
        } else {
          await loadPair();
        }
        // Refresh /me so vote count + avatar update.
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

  if (!pair) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h2 className="text-lg font-semibold">Nothing to vote on yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The roster hasn't been seeded — check back in a minute.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-4 md:py-8">
      <div className="text-center">
        <h2 className="text-base font-semibold tracking-tight md:text-lg">
          Who's the baddest?
        </h2>
        <p className="text-xs text-muted-foreground md:text-sm">
          Pick a face.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
        <PlayerCard
          imageId={pair.left.id}
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
          imageId={pair.right.id}
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

      <div className="flex justify-center pt-1">
        <Button
          variant="destructive"
          size="lg"
          className="h-12 w-full max-w-xs text-base font-semibold"
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
  onPick: () => void;
}

function PlayerCard({ imageId, state, onPick }: PlayerCardProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "group relative aspect-[5/4] overflow-hidden rounded-2xl border bg-muted transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:aspect-[4/3]",
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
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
        <div className="aspect-[5/4] animate-pulse rounded-2xl bg-muted md:aspect-[4/3]" />
        <div className="aspect-[5/4] animate-pulse rounded-2xl bg-muted md:aspect-[4/3]" />
      </div>
    </div>
  );
}
