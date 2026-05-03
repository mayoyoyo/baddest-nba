import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  NBA_HEADSHOT_SMALL,
  type ApiError,
  type UserLeaderboardResponseDto,
} from "@/lib/api";

export default function MePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<UserLeaderboardResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<UserLeaderboardResponseDto>(
          "/api/me/leaderboard",
        );
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError((err as ApiError).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          You're not signed in.
        </p>
        <Button className="mt-4" onClick={() => navigate("/login")}>
          Sign in
        </Button>
      </div>
    );
  }

  const top = data?.leaderboard.slice(0, 10) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
      <header className="mb-4 flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            @{user.username}
          </h2>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.summary.totalVotesCast} votes cast`
              : "Loading..."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            navigate("/login");
          }}
        >
          Sign out
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Your top 10</CardTitle>
          <p className="text-xs text-muted-foreground">
            Personal rankings — based only on your votes.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <p className="px-6 py-4 text-sm text-destructive">{error}</p>
          )}
          <ul className="flex flex-col divide-y">
            {top.map((row) => (
              <li
                key={row.image.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <span className="w-6 text-right text-sm font-semibold tabular-nums text-muted-foreground">
                  {row.rankPosition}
                </span>
                <img
                  src={NBA_HEADSHOT_SMALL(row.image.id)}
                  alt=""
                  className="size-10 shrink-0 rounded-md object-cover"
                  loading="lazy"
                  draggable={false}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {row.player
                      ? `${row.player.first} ${row.player.last}`
                      : row.image.id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.wins}W · {row.losses}L
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {Math.round(row.rating)}
                </span>
              </li>
            ))}
            {top.length === 0 && !error && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Vote on some matchups to start building your ranking.
              </p>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
