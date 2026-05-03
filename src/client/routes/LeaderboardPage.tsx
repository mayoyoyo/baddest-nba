import { useEffect, useState } from "react";
import {
  api,
  NBA_HEADSHOT_SMALL,
  type ApiError,
  type SharedLeaderboardEntryDto,
} from "@/lib/api";

export default function LeaderboardPage() {
  const [rows, setRows] = useState<SharedLeaderboardEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ leaderboard: SharedLeaderboardEntryDto[] }>(
          "/api/leaderboard/shared",
        );
        if (!cancelled) setRows(res.leaderboard);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!cancelled) setError(apiError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LeaderboardSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
      <header className="mb-4 px-1">
        <h2 className="text-lg font-semibold tracking-tight">Leaderboard</h2>
        <p className="text-sm text-muted-foreground">
          Aggregated across all voters.
        </p>
      </header>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {rows.map((row) => (
          <LeaderboardRow key={row.image.id} row={row} />
        ))}
      </ul>
    </div>
  );
}

function LeaderboardRow({ row }: { row: SharedLeaderboardEntryDto }) {
  const player = row.player;
  const name = player ? `${player.first} ${player.last}` : row.image.id;
  const teamLine = player?.team
    ? `${player.team}${player.pos ? ` · ${player.pos}` : ""}${player.jersey ? ` · #${player.jersey}` : ""}`
    : player?.pos ?? "";

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

function LeaderboardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
      <div className="flex flex-col divide-y rounded-xl border bg-card">
        {Array.from({ length: 10 }).map((_, i) => (
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
