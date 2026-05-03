import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { SessionUser } from "../lib/api";

type AppNavKey = "people" | "shared" | "upload" | "vote" | "your";

interface AppShellProps {
  activeNav: AppNavKey;
  children: ReactNode;
  onLogout: () => Promise<void>;
  title: string;
  user: SessionUser;
}

interface NavItem {
  key: AppNavKey;
  label: string;
  mobileLabel: string;
  to: string;
}

export default function AppShell({
  activeNav,
  children,
  onLogout,
  title,
  user,
}: AppShellProps) {
  const [utilityMenuOpen, setUtilityMenuOpen] = useState(false);

  const navItems: NavItem[] = [
    {
      key: "your",
      label: "Your leaderboard",
      mobileLabel: "Yours",
      to: `/users/${user.username}`,
    },
    {
      key: "shared",
      label: "Shared leaderboard",
      mobileLabel: "Shared",
      to: "/leaderboard",
    },
    {
      key: "people",
      label: "People",
      mobileLabel: "People",
      to: "/people",
    },
  ];

  const utilityNavItems =
    user.role === "admin"
      ? [{ label: "Admin upload", to: "/admin/upload" }]
      : [];

  async function handleLogout() {
    setUtilityMenuOpen(false);
    await onLogout();
  }

  function renderPrimaryNavLinks(className: string) {
    return navItems.map((item) => (
      <Link
        aria-label={item.label}
        className={activeNav === item.key ? `${className} ${className}--active` : className}
        key={item.key}
        onClick={() => setUtilityMenuOpen(false)}
        to={item.to}
      >
        <span className="app-pill-link__label app-pill-link__label--desktop">
          {item.label}
        </span>
        <span aria-hidden="true" className="app-pill-link__label app-pill-link__label--mobile">
          {item.mobileLabel}
        </span>
      </Link>
    ));
  }

  return (
    <main className="app-layout">
      <div className="app-main">
        <div className="app-main__inner">
          <header className="app-page-header">
            <div className="app-page-header__top">
              <h1>{title}</h1>
              <div className="app-utility">
                <button
                  aria-expanded={utilityMenuOpen}
                  aria-label="Open utility menu"
                  className="button button--ghost app-utility-toggle"
                  onClick={() => setUtilityMenuOpen((current) => !current)}
                  type="button"
                >
                  <span aria-hidden="true" className="app-utility-toggle__lines">
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
                {utilityMenuOpen ? (
                  <div className="app-utility-menu">
                    {utilityNavItems.map((item) => (
                      <Link
                        className="app-utility-link"
                        key={item.to}
                        onClick={() => setUtilityMenuOpen(false)}
                        to={item.to}
                      >
                        {item.label}
                      </Link>
                    ))}
                    <button
                      className="app-utility-link app-utility-link--button"
                      onClick={() => void handleLogout()}
                      type="button"
                    >
                      Log out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="app-page-header__nav">
              {activeNav !== "vote" ? (
                <Link
                  className="app-vote-button"
                  onClick={() => setUtilityMenuOpen(false)}
                  to="/vote"
                >
                  Vote
                </Link>
              ) : (
                <div aria-hidden="true" className="app-vote-button-placeholder" />
              )}
              <nav aria-label="Primary" className="app-pill-nav">
                {renderPrimaryNavLinks("app-pill-link")}
              </nav>
            </div>
          </header>
          {children}
        </div>
      </div>
    </main>
  );
}
