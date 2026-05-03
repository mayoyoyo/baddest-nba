import { describe, expect, it } from "vitest";
import { buildImageObjectKey } from "../../src/server/lib/storage";

describe("buildImageObjectKey", () => {
  it("escapes non-ascii characters in the image id segment", () => {
    expect(buildImageObjectKey("Jhene\u0301 Aiko", "original")).toBe(
      "images/Jhene%CC%81%20Aiko/original",
    );
  });

  it("escapes path separators in the image id segment", () => {
    expect(buildImageObjectKey("AC/DC", "display")).toBe(
      "images/AC%2FDC/display",
    );
  });
});
