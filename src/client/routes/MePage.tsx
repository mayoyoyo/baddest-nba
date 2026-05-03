import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthForm } from "@/components/AuthForm";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  AVATAR_VOTE_THRESHOLD,
  NBA_HEADSHOT_SMALL,
  type ApiError,
  type UserLeaderboardResponseDto,
} from "@/lib/api";

export default function MePage() {
  const { user, totalVotesCast, avatarImageId, signOut } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<UserLeaderboardResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMember = user && user.role !== "guest";

  useEffect(() => {
    if (!isMember) return;
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
  }, [isMember]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Vote on a few matchups first — that gives us something to save.
        </p>
        <Button className="mt-4" onClick={() => navigate("/")}>
          Start voting
        </Button>
      </div>
    );
  }

  if (user.role === "guest") {
    const remaining = Math.max(0, AVATAR_VOTE_THRESHOLD - totalVotesCast);
    return (
      <div className="mx-auto max-w-md px-3 py-4 md:py-8">
        <Card className="mb-4">
          <CardContent className="flex items-center gap-4 p-5">
            <Avatar imageId={avatarImageId} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Your taste, so far</p>
              <p className="text-xs text-muted-foreground">
                {totalVotesCast} {totalVotesCast === 1 ? "vote" : "votes"} cast
                {remaining > 0
                  ? ` · ${remaining} until your avatar shows up`
                  : " · your top pick is up there"}
              </p>
            </div>
          </CardContent>
        </Card>
        <AuthForm mode="signup" />
      </div>
    );
  }

  const top = data?.leaderboard.slice(0, 10) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
      <header className="mb-4 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <Avatar imageId={avatarImageId} size="lg" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              @{user.username}
            </h2>
            <p className="text-sm text-muted-foreground">
              {totalVotesCast} {totalVotesCast === 1 ? "vote" : "votes"} cast
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            navigate("/");
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
                    {row.comparisons}{" "}
                    {row.comparisons === 1 ? "vote" : "votes"}
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
