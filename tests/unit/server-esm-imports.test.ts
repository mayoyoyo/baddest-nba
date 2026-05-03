import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function findExtensionlessRelativeImports(source: string): string[] {
  const matches = source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g);
  return [...matches]
    .map((match) => match[1])
    .filter((specifier) => !specifier.endsWith(".js"));
}

describe("server ESM imports", () => {
  it("uses explicit .js extensions for runtime relative imports in Vercel server code", () => {
    const root = process.cwd();
    const files = ["api", "src/server"].flatMap((directory) =>
      collectTypeScriptFiles(join(root, directory)).map((absolutePath) =>
        absolutePath.slice(root.length + 1),
      ),
    );

    const offenders = files.flatMap((relativePath) => {
      const source = readFileSync(join(root, relativePath), "utf8");
      return findExtensionlessRelativeImports(source).map(
        (specifier) => `${relativePath}: ${specifier}`,
      );
    });

    expect(offenders).toEqual([]);
  });
});

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const nextPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTypeScriptFiles(nextPath);
    }

    return entry.name.endsWith(".ts") ? [nextPath] : [];
  });
}
