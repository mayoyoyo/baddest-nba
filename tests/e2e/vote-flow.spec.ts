import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const localDatabaseName = "DB";

function runWrangler(args: string[]): string {
  return execFileSync("npx", ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NO_D1_WARNING: "true",
    },
  });
}

function applyLocalMigrations(): void {
  runWrangler(["d1", "migrations", "apply", localDatabaseName, "--local"]);
}

function resetLocalData(): void {
  runWrangler([
    "d1",
    "execute",
    localDatabaseName,
    "--local",
    "--command",
    `
      DELETE FROM vote_events;
      DELETE FROM shared_image_state;
      DELETE FROM personal_image_state;
      DELETE FROM user_state;
      DELETE FROM sessions;
      DELETE FROM images;
      DELETE FROM users;
      DELETE FROM auth_attempts;
    `,
  ]);
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

function seedImagesForUser(username: string): void {
  const safeUsername = escapeSql(username);

  runWrangler([
    "d1",
    "execute",
    localDatabaseName,
    "--local",
    "--command",
    `
      INSERT INTO images (
        id,
        r2_key_original,
        r2_key_display,
        width,
        height,
        mime_type,
        sort_order,
        status,
        uploaded_by,
        created_at
      )
      VALUES
        (
          'e2e-img-1',
          'e2e-img-1-original',
          'e2e-img-1-display',
          1200,
          1600,
          'image/jpeg',
          0,
          'active',
          (SELECT id FROM users WHERE username = '${safeUsername}'),
          '2026-04-17T00:00:00.000Z'
        ),
        (
          'e2e-img-2',
          'e2e-img-2-original',
          'e2e-img-2-display',
          1200,
          1600,
          'image/jpeg',
          1,
          'active',
          (SELECT id FROM users WHERE username = '${safeUsername}'),
          '2026-04-17T00:00:00.000Z'
        ),
        (
          'e2e-img-3',
          'e2e-img-3-original',
          'e2e-img-3-display',
          1200,
          1600,
          'image/jpeg',
          2,
          'active',
          (SELECT id FROM users WHERE username = '${safeUsername}'),
          '2026-04-17T00:00:00.000Z'
        );
    `,
  ]);
}

test("signup, vote, and leaderboard refresh works", async ({ page }) => {
  applyLocalMigrations();
  resetLocalData();

  const username = `e2e_${Date.now()}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("4 digit passcode").fill("1234");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/vote$/);

  seedImagesForUser(username);
  await page.reload();

  const pairButtons = page.locator(".pair-card");
  await expect(pairButtons).toHaveCount(2);

  const winnerId = (
    await pairButtons
      .first()
      .locator("strong")
      .textContent()
  )?.trim();

  await pairButtons.first().click();

  await page.goto("/leaderboard");
  const topSharedRow = page.locator("tbody tr").first();
  await expect(topSharedRow).toContainText(winnerId ?? "");

  await page.goto(`/users/${username}`);
  await expect(page.getByText("Total votes")).toBeVisible();
  await expect(page.locator(".summary-card").first()).toContainText("1");
  await expect(page.locator("tbody tr").first()).toContainText(winnerId ?? "");
});
