import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:8788",
  },
  webServer: {
    command: "npm run e2e:server",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:8788",
  },
});
