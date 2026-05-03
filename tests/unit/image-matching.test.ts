import { describe, expect, it } from "vitest";
import {
  findMatchingImageIds,
  normalizeImageMatchKey,
} from "../../src/lib/imageMatching";

describe("image matching", () => {
  it("normalizes filenames and image ids for case, separators, and extensions", () => {
    expect(normalizeImageMatchKey("Mila Kunis.png")).toBe("mila kunis");
    expect(normalizeImageMatchKey("mila_kunis")).toBe("mila kunis");
    expect(normalizeImageMatchKey("MILA-KUNIS.jpg")).toBe("mila kunis");
  });

  it("finds existing image ids from normalized uploaded filenames", () => {
    expect(
      findMatchingImageIds("mila_kunis.png", [
        "Mila Kunis",
        "Ana de Armas",
      ]),
    ).toEqual(["Mila Kunis"]);
  });

  it("matches fuzzy filename variants with accents, punctuation, and copy suffixes", () => {
    expect(
      findMatchingImageIds("jhene-aiko-(1).webp", [
        "Jhene\u0301 Aiko",
        "Ana de Armas",
      ]),
    ).toEqual(["Jhene\u0301 Aiko"]);

    expect(
      findMatchingImageIds("zoe_kravitz-2.jpg", [
        "Zo\u00eb Kravitz",
        "Mila Kunis",
      ]),
    ).toEqual(["Zo\u00eb Kravitz"]);
  });

  it("allows a single small typo when there is one clear longer-name match", () => {
    expect(
      findMatchingImageIds("ella langgley.jpg", [
        "Ella Langley",
        "Ana de Armas",
      ]),
    ).toEqual(["Ella Langley"]);
  });

  it("refuses to guess when a typo could map to multiple close ids", () => {
    expect(
      findMatchingImageIds("ella langgley.jpg", [
        "Ella Langley",
        "Ella Langkley",
        "Ana de Armas",
      ]).sort(),
    ).toEqual(["Ella Langkley", "Ella Langley"]);
  });
});
