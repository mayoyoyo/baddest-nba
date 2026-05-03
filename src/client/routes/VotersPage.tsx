import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar } from "@/components/Avatar";
import {
  api,
  type ApiError,
  type VoterDto,
  type VotersResponseDto,
} from "@/lib/api";

export default function VotersPage() {
  const [voters, setVoters] = useState<VoterDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<VotersResponseDto>("/api/voters");
        if (!cancelled) setVoters(res.voters);
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-3 py-4 md:py-8">
        <header className="mb-4 flex items-center justify-between gap-3 px-1">
          <Link
            to="/me"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Me
          </Link>
          <h2 className="text-lg font-semibold tracking-tight">Voters</h2>
        </header>

        {loading && (
          <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {error && !loading && (
          <p className="px-1 text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && voters.length === 0 && (
          <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No voters yet.
          </div>
        )}

        {!loading && voters.length > 0 && (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {voters.map((voter) => (
              <li key={voter.username}>
                <Link
                  to={`/u/${encodeURIComponent(voter.username)}`}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40"
                >
                  <Avatar
                    imageId={voter.avatarImageId}
                    team={voter.baddestTeam?.abbr ?? null}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      @{voter.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {voter.totalVotesCast}{" "}
                      {voter.totalVotesCast === 1 ? "vote" : "votes"} cast
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
