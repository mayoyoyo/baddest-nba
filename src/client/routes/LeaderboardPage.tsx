import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  NBA_HEADSHOT_SMALL,
  PUBLIC_LEADERBOARD_TIER,
  type ApiError,
  type SharedLeaderboardEntryDto,
} from "@/lib/api";
import { cn } from "@/lib/cn";

export default function LeaderboardPage() {
  const [rows, setRows] = useState<SharedLeaderboardEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const isMember = user && user.role !== "guest";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ leaderboard: SharedLeaderboardEntryDto[] }>(
          "/api/leaderboard/shared",
        );
        if (!cancelled) setRows(res.leaderboard);
      } catch (err) {
        if (!cancelled) setError((err as ApiError).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <LeaderboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  const visibleRows = isMember
    ? rows
    : rows.slice(0, PUBLIC_LEADERBOARD_TIER);
  const hiddenCount = isMember ? 0 : Math.max(0, rows.length - visibleRows.length);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
        <header className="mb-4 px-1">
          <h2 className="text-lg font-semibold tracking-tight">Leaderboard</h2>
          <p className="text-sm text-muted-foreground">
            Aggregated across all signed-up voters.
          </p>
        </header>
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {visibleRows.map((row) => (
            <LeaderboardRow key={row.image.id} row={row} />
          ))}
          {hiddenCount > 0 && <PaywallRow hiddenCount={hiddenCount} />}
        </ul>
      </div>
    </div>
  );
}

function LeaderboardRow({ row }: { row: SharedLeaderboardEntryDto }) {
  const player = row.player;
  const name = player ? `${player.first} ${player.last}` : row.image.id;
  const teamLine = player?.team
    ? `${player.team}${player.pos ? ` · ${player.pos}` : ""}${player.jersey ? ` · #${player.jersey}` : ""}`
    : (player?.pos ?? "");

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">
        {row.rankPosition}
      </span>
      <img
        src={NBA_HEADSHOT_SMALL(row.image.id)}
        alt=""
        className="size-12 shrink-0 rounded-md object-cover"
        loading="lazy"
        draggable={false}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {teamLine && (
          <p className="truncate text-xs text-muted-foreground">{teamLine}</p>
        )}
      </div>
      <div className="flex flex-col items-end">
        <span className="text-sm font-semibold tabular-nums">
          {row.aggregateScore.toFixed(1)}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          score
        </span>
      </div>
    </li>
  );
}

function PaywallRow({ hiddenCount }: { hiddenCount: number }) {
  return (
    <li className="relative flex flex-col items-center gap-3 px-4 py-8 text-center">
      <BlurredPreview />
      <div className="relative z-10 flex flex-col items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
          <Lock className="size-3.5" />
          {hiddenCount} more ranked below
        </span>
        <h3 className="text-base font-semibold">
          Sign up to see the full leaderboard
        </h3>
        <p className="max-w-xs text-xs text-muted-foreground">
          Free. Saves your taste so you can come back to it.
        </p>
        <Link
          to="/signup"
          className={cn(buttonVariants({ size: "sm" }), "mt-1")}
        >
          Sign up
        </Link>
      </div>
    </li>
  );
}

function BlurredPreview() {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 bottom-3 flex flex-col gap-2 opacity-50 blur-sm">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="size-8 shrink-0 rounded-md bg-muted-foreground/30" />
          <div className="flex-1 space-y-1">
            <div className="h-2.5 w-32 rounded bg-muted-foreground/30" />
            <div className="h-1.5 w-20 rounded bg-muted-foreground/20" />
          </div>
          <div className="h-3 w-8 rounded bg-muted-foreground/30" />
        </div>
      ))}
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
      <div className="flex flex-col divide-y rounded-xl border bg-card">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className="size-12 animate-pulse rounded-md bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-2 w-20 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
