// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import LeaderboardTable from "./LeaderboardTable";

function renderTable(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <LeaderboardTable
        rows={[
          {
            confidence: 0.51,
            image: { id: "LISA" },
            rankPosition: 1,
            score: "1.42",
            wins: 12,
          },
        ]}
      />,
    );
  });

  return { container, root };
}

describe("LeaderboardTable", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens an image popout from the thumbnail-name cell and closes it", async () => {
    const { container, root } = renderTable();

    expect(container.textContent).toContain("Wins");
    expect(container.textContent).toContain("12");
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    const previewButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("LISA"),
    );
    expect(previewButton).toBeDefined();

    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    const expandedImage = dialog?.querySelector("img");
    expect(expandedImage?.getAttribute("src")).toBe("/api/image?imageId=LISA");

    const closeButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Close"),
    );
    expect(closeButton).toBeDefined();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
