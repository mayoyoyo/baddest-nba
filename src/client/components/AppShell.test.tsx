// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

function renderShell(input?: {
  activeNav?: "people" | "shared" | "upload" | "vote" | "your";
  role?: "admin" | "user";
  title?: string;
}): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onLogout = vi.fn();

  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/people"]}>
        <AppShell
          activeNav={input?.activeNav ?? "people"}
          onLogout={onLogout}
          title={input?.title ?? "People"}
          user={{
            id: "user-1",
            role: input?.role ?? "user",
            username: "warren",
          }}
        >
          <p>Body content</p>
        </AppShell>
      </MemoryRouter>,
    );
  });

  return { container, root };
}

describe("AppShell", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a separate vote button and pill navigation in the requested order", () => {
    const { container, root } = renderShell();

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toBe("People");
    expect(container.querySelector(".app-sidebar")).toBeNull();
    expect(container.querySelector(".app-page-header__top h1")?.textContent).toBe(
      "People",
    );
    expect(
      container.querySelector('.app-page-header__top button[aria-label="Open utility menu"]'),
    ).not.toBeNull();

    const navRow = container.querySelector(".app-page-header__nav");
    expect(navRow).not.toBeNull();

    const voteLinks = Array.from(navRow?.querySelectorAll("a") ?? []).filter(
      (link) => link.textContent?.trim() === "Vote",
    );
    expect(voteLinks).toHaveLength(1);
    expect(voteLinks[0]?.className).toContain("app-vote-button");

    const pillNav = navRow?.querySelector(".app-pill-nav");
    expect(pillNav).not.toBeNull();
    const pillLinks = Array.from(pillNav?.querySelectorAll("a") ?? []).map((link) =>
      link.getAttribute("aria-label") ?? link.textContent?.trim(),
    );
    expect(pillLinks).toEqual([
      "Your leaderboard",
      "Shared leaderboard",
      "People",
    ]);

    act(() => {
      root.unmount();
    });
  });

  it("keeps upload and logout inside the utility menu", async () => {
    const { container, root } = renderShell({
      activeNav: "upload",
      role: "admin",
      title: "Upload",
    });

    const pillNav = container.querySelector(".app-pill-nav");
    expect(pillNav?.textContent).not.toContain("Upload");
    expect(container.textContent).not.toContain("Log out");

    const menuButton = container.querySelector(
      'button[aria-label="Open utility menu"]',
    );
    expect(menuButton).not.toBeNull();

    await act(async () => {
      menuButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Upload");
    const logoutButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Log out",
    );
    expect(logoutButton).toBeDefined();

    act(() => {
      root.unmount();
    });
  });

  it("hides the separate vote button when already on the vote page", () => {
    const { container, root } = renderShell({
      activeNav: "vote",
      title: "Baddest in the game",
    });

    const navRow = container.querySelector(".app-page-header__nav");
    expect(navRow).not.toBeNull();

    const voteLinks = Array.from(navRow?.querySelectorAll("a") ?? []).filter(
      (link) => link.textContent?.trim() === "Vote",
    );
    expect(voteLinks).toHaveLength(0);
    expect(navRow?.querySelector(".app-vote-button-placeholder")).not.toBeNull();

    const pillLinks = Array.from(navRow?.querySelectorAll(".app-pill-nav a") ?? []).map(
      (link) => link.getAttribute("aria-label") ?? link.textContent?.trim(),
    );
    expect(pillLinks).toEqual([
      "Your leaderboard",
      "Shared leaderboard",
      "People",
    ]);

    act(() => {
      root.unmount();
    });
  });
});
