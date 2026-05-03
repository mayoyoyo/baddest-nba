// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteAdminImageMock,
  loadCurrentUserMock,
  prepareImageForUploadMock,
  searchAdminImagesMock,
  uploadAdminImageMock,
} = vi.hoisted(() => ({
  deleteAdminImageMock: vi.fn(),
  loadCurrentUserMock: vi.fn(),
  prepareImageForUploadMock: vi.fn(),
  searchAdminImagesMock: vi.fn(),
  uploadAdminImageMock: vi.fn(),
}));

vi.mock("../lib/session", () => ({
  loadCurrentUser: loadCurrentUserMock,
}));

vi.mock("../lib/imagePrep", () => ({
  prepareImageForUpload: prepareImageForUploadMock,
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>(
    "../lib/api",
  );

  return {
    ...actual,
    deleteAdminImage: deleteAdminImageMock,
    searchAdminImages: searchAdminImagesMock,
    uploadAdminImage: uploadAdminImageMock,
  };
});

import AdminUploadPage from "./AdminUploadPage";

async function flushAsync(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function renderPage(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin/upload"]}>
        <AdminUploadPage />
      </MemoryRouter>,
    );
  });

  return { container, root };
}

describe("AdminUploadPage", () => {
  let inputOriginalFile: File;
  let preparedDisplayFile: File;

  beforeEach(() => {
    preparedDisplayFile = new File(["display"], "face-display.jpg", {
      type: "image/jpeg",
    });
    loadCurrentUserMock.mockResolvedValue({
      id: "user-admin",
      role: "admin",
      username: "admin",
    });
    prepareImageForUploadMock.mockResolvedValue({
      displayFile: preparedDisplayFile,
      height: 640,
      previewUrl: "blob:preview-face",
      width: 480,
    });
    uploadAdminImageMock.mockResolvedValue({
      image: { id: "img-1" },
    });
    searchAdminImagesMock.mockResolvedValue({
      images: [{ id: "Jhene Aiko" }],
    });
    deleteAdminImageMock.mockResolvedValue({ ok: true });
    vi.stubGlobal(
      "crypto",
      { randomUUID: vi.fn(() => "upload-item-1") } as unknown as Crypto,
    );
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps preview URLs alive until the page unmounts", async () => {
    const { container, root } = renderPage();

    await flushAsync();

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    inputOriginalFile = new File(["original"], "mila_kunis.png", {
      type: "image/jpeg",
    });
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [inputOriginalFile],
    });

    await act(async () => {
      fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flushAsync();

    const uploadButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Upload ready files"),
    );
    expect(uploadButton).toBeDefined();

    await act(async () => {
      uploadButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsync(5);

    expect(uploadAdminImageMock).toHaveBeenCalledTimes(1);
    const uploadCall = uploadAdminImageMock.mock.calls[0]?.[0];
    expect(uploadCall?.display).toBe(preparedDisplayFile);
    expect(uploadCall?.height).toBe(640);
    expect(uploadCall?.replaceImageId).toBeUndefined();
    expect(uploadCall?.sourceName).toBe("mila_kunis.png");
    expect(uploadCall?.original).toBeUndefined();
    expect(uploadCall?.width).toBe(480);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-face");
  });

  it("searches by image id and deletes a matching photo from the same page", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));

    const { container, root } = renderPage();
    await flushAsync();

    const searchInput = container.querySelector(
      'input[name="delete-search"]',
    ) as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    expect(valueSetter).toBeDefined();

    await act(async () => {
      valueSetter?.call(searchInput, "jhene");
      searchInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushAsync();

    const searchButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Search photos"),
    );
    expect(searchButton).toBeDefined();

    await act(async () => {
      searchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsync();

    expect(searchAdminImagesMock).toHaveBeenCalledWith("jhene");
    expect(container.textContent).toContain("Jhene Aiko");

    const deleteButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Delete"),
    );
    expect(deleteButton).toBeDefined();

    await act(async () => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsync();

    expect(deleteAdminImageMock).toHaveBeenCalledWith("Jhene Aiko");
    expect(container.textContent).not.toContain("Jhene Aiko");

    await act(async () => {
      root.unmount();
    });
  });
});
