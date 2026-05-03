// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImagePair from "./ImagePair";

function renderPair(): {
  container: HTMLDivElement;
  onChoose: ReturnType<typeof vi.fn>;
  onSkip: ReturnType<typeof vi.fn>;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onChoose = vi.fn().mockResolvedValue(undefined);
  const onSkip = vi.fn().mockResolvedValue(undefined);

  act(() => {
    root.render(
      <ImagePair
        onChoose={onChoose}
        onSkip={onSkip}
        pair={{
          left: { id: "left-id" },
          right: { id: "right-id" },
        }}
      />,
    );
  });

  return { container, root, onChoose, onSkip };
}

describe("ImagePair", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders a skip control and omits the old pick-this label", async () => {
    const { container, onChoose, onSkip, root } = renderPair();

    expect(container.textContent).not.toContain("Pick this");

    const pairGrid = container.querySelector(".pair-grid");
    const pairGridChildren = Array.from(pairGrid?.children ?? []);
    expect(pairGridChildren[0]?.classList.contains("pair-card--left")).toBe(true);
    expect(pairGridChildren[1]?.classList.contains("pair-card--right")).toBe(true);
    expect(pairGridChildren[2]?.classList.contains("pair-grid__skip")).toBe(true);

    const skipButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Skip matchup"),
    );
    expect(skipButton).toBeDefined();

    await act(async () => {
      skipButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSkip).toHaveBeenCalledTimes(1);

    const [leftButton] = Array.from(container.querySelectorAll("button"));
    await act(async () => {
      leftButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChoose).toHaveBeenCalledWith("left-id", "right-id");

    act(() => {
      root.unmount();
    });
  });
});
