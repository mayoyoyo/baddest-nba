import { NBA_HEADSHOT_SMALL, NBA_TEAM_LOGO } from "@/lib/api";
import { cn } from "@/lib/cn";

interface AvatarProps {
  imageId: string | null;
  size?: "sm" | "md" | "lg";
  team?: string | null;
  className?: string;
}

const SIZES = {
  sm: "size-8 text-base",
  md: "size-10 text-lg",
  lg: "size-16 text-2xl",
} as const;

const TEAM_BADGE_SIZES = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-6",
} as const;

export function Avatar({
  imageId,
  size = "sm",
  team,
  className,
}: AvatarProps) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      aria-hidden
    >
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-full border bg-muted",
          SIZES[size],
        )}
      >
        {imageId ? (
          <img
            src={NBA_HEADSHOT_SMALL(imageId)}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="leading-none">🏀</span>
        )}
      </span>
      {team && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center rounded-full border border-background bg-background shadow-sm",
            TEAM_BADGE_SIZES[size],
          )}
        >
          <img
            src={NBA_TEAM_LOGO(team)}
            alt=""
            className="h-full w-full rounded-full object-contain"
            draggable={false}
          />
        </span>
      )}
    </span>
  );
}
