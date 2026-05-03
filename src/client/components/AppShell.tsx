import { Trophy, Vote } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";

const PRIMARY_NAV = [
  { to: "/", label: "Vote", icon: Vote, end: true },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy, end: false },
] as const;

export function AppShell() {
  const location = useLocation();
  const { avatarImageId, user } = useAuth();
  const meLabel = user && user.role !== "guest" ? user.username : "Me";

  const minimalChrome =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/signup");

  if (minimalChrome) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <NavLink to="/" className="text-lg font-bold tracking-tight">
            Baddest in the L
          </NavLink>
          <ThemeToggle />
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col pb-20 md:pb-0">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur">
        <NavLink to="/" className="text-lg font-bold tracking-tight">
          Baddest in the L
        </NavLink>
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
            <Avatar imageId={avatarImageId} size="sm" />
            <span className="max-w-[8rem] truncate">{meLabel}</span>
          </NavLink>
          <ThemeToggle />
        </nav>
        <div className="md:hidden">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t bg-background/95 backdrop-blur md:hidden">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="size-5" />
              {item.label}
            </NavLink>
          );
        })}
        <NavLink
          to="/me"
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center gap-1 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          <Avatar imageId={avatarImageId} size="sm" />
          <span className="max-w-[6rem] truncate">{meLabel}</span>
        </NavLink>
      </nav>
    </div>
  );
}
