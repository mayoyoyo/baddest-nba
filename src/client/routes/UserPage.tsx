import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { UserProfileView } from "@/components/UserProfileView";
import {
  api,
  type ApiError,
  type UserLeaderboardResponseDto,
} from "@/lib/api";

export default function UserPage() {
  const { username = "" } = useParams<{ username: string }>();
  const [data, setData] = useState<UserLeaderboardResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get<UserLeaderboardResponseDto>(
          `/api/users/${encodeURIComponent(username)}/leaderboard`,
        );
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError((err as ApiError).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
        <div className="mb-3 px-1">
          <Link
            to="/voters"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Voters
          </Link>
        </div>

        {loading && (
          <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <UserProfileView
            username={data.user.username}
            totalVotesCast={data.summary.totalVotesCast}
            avatarImageId={data.avatarImageId}
            baddestTeam={data.baddestTeam}
            entries={data.leaderboard}
          />
        )}
      </div>
    </div>
  );
}
