import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { AuthForm } from "@/components/AuthForm";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { UserProfileView } from "@/components/UserProfileView";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  AVATAR_VOTE_THRESHOLD,
  type ApiError,
  type UserLeaderboardResponseDto,
} from "@/lib/api";

export default function MePage() {
  const { user, totalVotesCast, avatarImageId, avatarTeam, signOut } =
    useAuth();
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
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-md text-center">
          <p className="text-sm text-muted-foreground">
            Vote on a few matchups first — that gives us something to save.
          </p>
          <Button className="mt-4" onClick={() => navigate("/")}>
            Start voting
          </Button>
        </div>
      </div>
    );
  }

  if (user.role === "guest") {
    const remaining = Math.max(0, AVATAR_VOTE_THRESHOLD - totalVotesCast);
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-md px-3 py-4 md:py-8">
          <Card className="mb-4">
            <CardContent className="flex items-center gap-4 p-5">
              <Avatar imageId={avatarImageId} team={avatarTeam} size="lg" />
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
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
        {error && (
          <p className="mb-3 px-1 text-sm text-destructive">{error}</p>
        )}
        <UserProfileView
          username={user.username}
          totalVotesCast={totalVotesCast}
          avatarImageId={avatarImageId}
          avatarTeam={avatarTeam}
          entries={data?.leaderboard ?? []}
          headerTrailing={
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
          }
        />

        <div className="mt-4 flex justify-center">
          <Link
            to="/voters"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            See who else is voting
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
