import { Crown, Trophy } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ALL_NBA_TEAM_SIZE,
  ALL_STARS_PER_CONFERENCE,
  AVATAR_VOTE_THRESHOLD,
  NBA_HEADSHOT_SMALL,
  type ConferenceDto,
  type UserLeaderboardEntryDto,
} from "@/lib/api";
import { cn } from "@/lib/cn";

export interface UserProfileViewProps {
  username: string;
  totalVotesCast: number;
  avatarImageId: string | null;
  avatarTeam: string | null;
  entries: UserLeaderboardEntryDto[];
  headerTrailing?: React.ReactNode;
  headline?: string;
}

export function UserProfileView({
  username,
  totalVotesCast,
  avatarImageId,
  avatarTeam,
  entries,
  headerTrailing,
  headline,
}: UserProfileViewProps) {
  const showFirstTeam = totalVotesCast >= AVATAR_VOTE_THRESHOLD;
  const firstTeam = entries.slice(0, ALL_NBA_TEAM_SIZE);
  const east = entries
    .filter((row) => row.player?.conference === "East")
    .slice(0, ALL_STARS_PER_CONFERENCE);
  const west = entries
    .filter((row) => row.player?.conference === "West")
    .slice(0, ALL_STARS_PER_CONFERENCE);

  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            imageId={avatarImageId}
            team={avatarTeam}
            size="lg"
          />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              @{username}
            </h2>
            <p className="text-sm text-muted-foreground">
              {headline ??
                `${totalVotesCast} ${
                  totalVotesCast === 1 ? "vote" : "votes"
                } cast`}
            </p>
          </div>
        </div>
        {headerTrailing}
      </header>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="px-4 py-6 text-center text-sm text-muted-foreground">
            No rankings yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {showFirstTeam && firstTeam.length > 0 && (
            <FirstTeamCard entries={firstTeam} />
          )}
          <AllStarsCard conference="East" entries={east} />
          <AllStarsCard conference="West" entries={west} />
        </div>
      )}
    </>
  );
}

function FirstTeamCard({ entries }: { entries: UserLeaderboardEntryDto[] }) {
  return (
    <Card className="border-amber-300/60 dark:border-amber-500/30">
      <CardHeader className="bg-gradient-to-r from-amber-50 to-transparent dark:from-amber-500/10">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-amber-500" />
          Your 1st Team
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Your top 5, with your MVP up top.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="flex flex-col divide-y">
          {entries.map((row, idx) => (
            <FirstTeamRow key={row.image.id} row={row} isMvp={idx === 0} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function FirstTeamRow({
  row,
  isMvp,
}: {
  row: UserLeaderboardEntryDto;
  isMvp: boolean;
}) {
  const player = row.player;
  const name = player ? `${player.first} ${player.last}` : row.image.id;
  const teamLine = player?.team
    ? `${player.team}${player.pos ? ` · ${player.pos}` : ""}`
    : (player?.pos ?? "");

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
        {Math.round(row.rating)}
      </span>
    </li>
  );
}

function AllStarsCard({
  conference,
  entries,
}: {
  conference: ConferenceDto;
  entries: UserLeaderboardEntryDto[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{conference}ern Conference All-Stars</CardTitle>
        <p className="text-xs text-muted-foreground">
          Top {ALL_STARS_PER_CONFERENCE} from the {conference}.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="flex flex-col divide-y">
          {entries.map((row, idx) => (
            <li
              key={row.image.id}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span className="w-6 text-right text-sm font-semibold tabular-nums text-muted-foreground">
                {idx + 1}
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
                <p className="truncate text-xs text-muted-foreground">
                  {row.player?.team ?? ""}
                  {row.player?.team && row.player?.pos ? " · " : ""}
                  {row.player?.pos ?? ""}
                  {(row.player?.team || row.player?.pos) ? " · " : ""}
                  {row.comparisons} {row.comparisons === 1 ? "vote" : "votes"}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {Math.round(row.rating)}
              </span>
            </li>
          ))}
          {entries.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No {conference} players ranked yet.
            </p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
