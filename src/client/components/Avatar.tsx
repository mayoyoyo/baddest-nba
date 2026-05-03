import { NBA_HEADSHOT_SMALL } from "@/lib/api";
import { cn } from "@/lib/cn";

interface AvatarProps {
  imageId: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "size-8 text-base",
  md: "size-10 text-lg",
  lg: "size-16 text-2xl",
} as const;

export function Avatar({ imageId, size = "sm", className }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted",
        SIZES[size],
        className,
      )}
      aria-hidden
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
  );
}
