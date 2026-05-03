/// <reference types="@cloudflare/vitest-pool-workers/types" />

export {};

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    }
  }
}
