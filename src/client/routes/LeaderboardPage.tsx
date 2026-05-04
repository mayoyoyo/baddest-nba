import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Crown, Lock, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  ALL_NBA_TEAM_COUNT,
  ALL_NBA_TEAM_SIZE,
  NBA_HEADSHOT_SMALL,
  PUBLIC_LEADERBOARD_TIER,
  type ApiError,
  type SharedLeaderboardEntryDto,
} from "@/lib/api";
import { cn } from "@/lib/cn";

type PositionPill = "G" | "F" | "C";
const POSITION_PILLS: readonly PositionPill[] = ["G", "F", "C"] as const;
const ALL_POSITIONS: ReadonlySet<PositionPill> = new Set(POSITION_PILLS);

type View = "all-nba" | "full";

export default function LeaderboardPage() {
  const [rows, setRows] = useState<SharedLeaderboardEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("all-nba");
  const [selected, setSelected] = useState<Set<PositionPill>>(
    () => new Set(ALL_POSITIONS),
  );
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

  const togglePill = (pill: PositionPill) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pill)) next.delete(pill);
      else next.add(pill);
      // Zero selected snaps back to all selected.
      if (next.size === 0) return new Set(ALL_POSITIONS);
      return next;
    });
  };

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

  if (view === "all-nba") {
    return (
      <AllNbaView
        rows={rows}
        onSeeFull={() => setView("full")}
      />
    );
  }

  return (
    <FullLeaderboardView
      rows={rows}
      isMember={!!isMember}
      selected={selected}
      togglePill={togglePill}
      onBack={() => setView("all-nba")}
    />
  );
}

function AllNbaView({
  rows,
  onSeeFull,
}: {
  rows: SharedLeaderboardEntryDto[];
  onSeeFull: () => void;
}) {
  // No eligibility floor: the server applies Bayesian smoothing on the
  // crowd score against a popularity prior, so unrated names still
  // surface a meaningful default. Top 15 by smoothed score, sliced
  // into 1st/2nd/3rd tiers.
  const teams: SharedLeaderboardEntryDto[][] = useMemo(() => {
    const out: SharedLeaderboardEntryDto[][] = [];
    for (let i = 0; i < ALL_NBA_TEAM_COUNT; i++) {
      out.push(rows.slice(i * ALL_NBA_TEAM_SIZE, (i + 1) * ALL_NBA_TEAM_SIZE));
    }
    return out;
  }, [rows]);

  const tierLabels = ["1st Team", "2nd Team", "3rd Team"];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
        <header className="mb-5 px-1">
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" />
            <h2 className="text-lg font-semibold tracking-tight">All-NBA</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The 15 baddest in the L, ranked by the crowd.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-xl border bg-card px-4 py-10 text-center">
            <Trophy className="mx-auto mb-2 size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No players ranked yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {teams.map((team, tierIndex) => {
              if (team.length === 0) return null;
              const isFirstTeam = tierIndex === 0;
              return (
                <section
                  key={tierIndex}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-card",
                    isFirstTeam &&
                      "border-amber-300/60 shadow-sm dark:border-amber-500/30",
                  )}
                >
                  <header
                    className={cn(
                      "flex items-center justify-between border-b px-4 py-2",
                      isFirstTeam &&
                        "border-amber-200/60 bg-gradient-to-r from-amber-50 to-transparent dark:border-amber-500/20 dark:from-amber-500/10",
                    )}
                  >
                    <h3 className="text-sm font-semibold tracking-tight">
                      {tierLabels[tierIndex]}
                    </h3>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      All-NBA
                    </span>
                  </header>
                  <ul className="flex flex-col divide-y">
                    {team.map((row, rowIndex) => (
                      <AllNbaRow
                        key={row.image.id}
                        row={row}
                        isMvp={isFirstTeam && rowIndex === 0}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Button variant="outline" size="sm" onClick={onSeeFull}>
            See full leaderboard
          </Button>
        </div>
      </div>
    </div>
  );
}

function viewerRecordLabel(row: SharedLeaderboardEntryDto): string | null {
  if (row.viewerComparisons <= 0) return null;
  return `You ${row.viewerWins}-${row.viewerLosses}`;
}

function AllNbaRow({
  row,
  isMvp,
}: {
  row: SharedLeaderboardEntryDto;
  isMvp: boolean;
}) {
  const player = row.player;
  const name = player ? `${player.first} ${player.last}` : row.image.id;
  const teamLineParts: string[] = [];
  if (player?.team) teamLineParts.push(player.team);
  if (player?.pos) teamLineParts.push(player.pos);
  const viewerLabel = viewerRecordLabel(row);
  if (viewerLabel) teamLineParts.push(viewerLabel);
  const teamLine = teamLineParts.join(" · ");

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        isMvp &&
          "bg-gradient-to-r from-amber-100/70 via-amber-50/40 to-transparent dark:from-amber-500/15 dark:via-amber-500/5",
      )}
    >
      <img
        src={NBA_HEADSHOT_SMALL(row.image.id)}
        alt=""
        className={cn(
          "size-12 shrink-0 rounded-md object-cover",
          isMvp && "ring-2 ring-amber-400 dark:ring-amber-400/80",
        )}
        loading="lazy"
        draggable={false}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p
            className={cn(
              "truncate text-sm font-medium",
              isMvp && "font-semibold",
            )}
          >
            {name}
          </p>
          {isMvp && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
              <Crown className="size-3" />
              MVP
            </span>
          )}
        </div>
        {teamLine && (
          <p className="truncate text-xs text-muted-foreground">{teamLine}</p>
        )}
      </div>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          isMvp && "text-amber-700 dark:text-amber-300",
        )}
      >
        {row.aggregateScore.toFixed(0)}
      </span>
    </li>
  );
}

function FullLeaderboardView({
  rows,
  isMember,
  selected,
  togglePill,
  onBack,
}: {
  rows: SharedLeaderboardEntryDto[];
  isMember: boolean;
  selected: Set<PositionPill>;
  togglePill: (pill: PositionPill) => void;
  onBack: () => void;
}) {
  const allSelected = selected.size === ALL_POSITIONS.size;

  const filtered = useMemo(() => {
    if (allSelected) return rows;
    return rows.filter((row) => matchesPills(row.player?.pos ?? null, selected));
  }, [rows, selected, allSelected]);

  const visibleRows = isMember
    ? filtered
    : filtered.slice(0, PUBLIC_LEADERBOARD_TIER);
  const hiddenCount = isMember
    ? 0
    : Math.max(0, filtered.length - visibleRows.length);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
        <header className="mb-3 flex items-center justify-between gap-3 px-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            All-NBA
          </button>
          <h2 className="text-lg font-semibold tracking-tight">
            Full leaderboard
          </h2>
        </header>

        <div className="mb-3 flex items-center gap-1.5 px-1">
          {POSITION_PILLS.map((pill) => {
            const active = selected.has(pill);
            return (
              <button
                key={pill}
                type="button"
                onClick={() => togglePill(pill)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                )}
              >
                {pill}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "player" : "players"}
          </span>
        </div>

        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {visibleRows.map((row) => (
            <LeaderboardRow key={row.image.id} row={row} />
          ))}
          {visibleRows.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No players match this filter.
            </li>
          )}
          {hiddenCount > 0 && <PaywallRow hiddenCount={hiddenCount} />}
        </ul>
      </div>
    </div>
  );
}

function matchesPills(
  pos: string | null,
  selected: Set<PositionPill>,
): boolean {
  if (!pos) return false;
  const positions = pos
    .split("-")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean) as PositionPill[];
  return positions.some((p) => selected.has(p));
}

function LeaderboardRow({ row }: { row: SharedLeaderboardEntryDto }) {
  const player = row.player;
  const name = player ? `${player.first} ${player.last}` : row.image.id;
  const teamLineParts: string[] = [];
  if (player?.team) teamLineParts.push(player.team);
  if (player?.pos) teamLineParts.push(player.pos);
  if (player?.jersey) teamLineParts.push(`#${player.jersey}`);
  const viewerLabel = viewerRecordLabel(row);
  if (viewerLabel) teamLineParts.push(viewerLabel);
  const teamLine = teamLineParts.join(" · ");

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
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, t) => (
          <div key={t} className="rounded-xl border bg-card">
            <div className="border-b px-4 py-2">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="size-12 animate-pulse rounded-md bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-2 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
