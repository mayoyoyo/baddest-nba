import { Trophy, Vote } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CURRENT_SEASON_LABEL } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";

function BrandMark() {
  return (
    <NavLink to="/" className="flex items-center gap-2">
      <span className="text-base font-bold tracking-tight">
        Baddest in the L
      </span>
      <span className="rounded-md border border-red-700/60 bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider text-white">
        {CURRENT_SEASON_LABEL}
      </span>
    </NavLink>
  );
}

const PRIMARY_NAV = [
  { to: "/", label: "Vote", icon: Vote, end: true },
  { to: "/leaderboard", label: "All-NBA", icon: Trophy, end: false },
] as const;

export function AppShell() {
  const location = useLocation();
  const { avatarImageId, baddestTeam, user } = useAuth();
  const meLabel = user && user.role !== "guest" ? user.username : "Me";

  const minimalChrome =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/signup");

  if (minimalChrome) {
    return (
      <div className="flex h-dvh flex-col">
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
          <BrandMark />
          <ThemeToggle />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-2.5">
        <BrandMark />
        <nav className="hidden items-center gap-1 md:flex">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/me"
            className={({ isActive }) =>
              cn(
                "ml-1 flex items-center gap-2 rounded-full py-0.5 pl-1 pr-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )
            }
          >
            <Avatar imageId={avatarImageId} team={baddestTeam?.abbr ?? null} size="sm" />
            <span className="max-w-[8rem] truncate">{meLabel}</span>
          </NavLink>
          <ThemeToggle />
        </nav>
        <div className="md:hidden">
          <ThemeToggle />
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Outlet />
      </main>

      <nav className="grid shrink-0 grid-cols-3 border-t bg-background pb-[env(safe-area-inset-bottom,0px)] md:hidden">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium leading-tight transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="size-4" />
              {item.label}
            </NavLink>
          );
        })}
        <NavLink
          to="/me"
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium leading-tight transition-colors",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          <Avatar imageId={avatarImageId} team={baddestTeam?.abbr ?? null} size="sm" />
          <span className="max-w-[6rem] truncate">{meLabel}</span>
        </NavLink>
      </nav>
    </div>
  );
}
