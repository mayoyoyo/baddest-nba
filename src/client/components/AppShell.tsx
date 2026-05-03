import { Trophy, User, Vote } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { to: "/", label: "Vote", icon: Vote, end: true },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy, end: false },
  { to: "/me", label: "Me", icon: User, end: false },
] as const;

export function AppShell() {
  const location = useLocation();
  const { avatarImageId } = useAuth();

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
          {NAV.map((item) => (
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
          <ThemeToggle />
          <Avatar imageId={avatarImageId} size="sm" className="ml-1" />
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Avatar imageId={avatarImageId} size="sm" />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t bg-background/95 backdrop-blur md:hidden">
        {NAV.map((item) => {
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
      </nav>
    </div>
  );
}
