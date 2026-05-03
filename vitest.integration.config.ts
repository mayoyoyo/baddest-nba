import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./src/server/worker.ts",
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
      miniflare: {
        bindings: {
          SIGNUPS_OPEN: "true",
          TEST_MIGRATIONS: await readD1Migrations(
            new URL("./migrations", import.meta.url).pathname,
          ),
        },
      },
    })),
  ],
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/apply-migrations.ts"],
  },
});
