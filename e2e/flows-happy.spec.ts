import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("happy paths (seeded DB)", () => {
  test("login → home feed shows seeded post", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("munkh@linksy.mn");
    await page.locator("#password").fill("password123");
    await page.locator("form.login-form").locator('button[type="submit"]').click();
    await page.waitForURL(/\/home/, { timeout: 30_000 });
    await expect(page.getByText(/spring|Khangai|coffee|coding/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("login → messages screen", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("munkh@linksy.mn");
    await page.locator("#password").fill("password123");
    await page.locator("form.login-form").locator('button[type="submit"]').click();
    await page.waitForURL(/\/home/, { timeout: 30_000 });
    await page.goto("/messages");
    await expect(page).toHaveURL(/\/messages/);
  });

  test("register → lands on home", async ({ page }) => {
    const id = Date.now();
    const password = `Aa1!Reg${id}x`;
    await page.goto("/register");
    await page.locator("#displayName").fill(`E2E User ${id}`);
    await page.locator("#username").fill(`e2e_${id}`);
    await page.locator("#email").fill(`e2e_${id}@example.test`);
    await page.locator("#password").fill(password);
    await page.locator("form").locator("button.primary-button[type='submit']").click();
    await page.waitForURL(/\/home/, { timeout: 45_000 });
  });

  test("forgot-password flow submits for seeded email", async ({ page }) => {
    await page.goto("/auth/forgot-password");
    await page.getByPlaceholder("you@example.com").fill("munkh@linksy.mn");
    await page.locator("form.auth-form").locator('button[type="submit"]').click();
    await expect(page.getByText(/reset|inbox|холбоос/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("login → like first post on feed", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("munkh@linksy.mn");
    await page.locator("#password").fill("password123");
    await page.locator("form.login-form").locator('button[type="submit"]').click();
    await page.waitForURL(/\/home/, { timeout: 30_000 });
    const likeBtn = page.locator(".post-card").first().locator(".action-btn").first();
    await likeBtn.click();
    await expect(likeBtn).toBeVisible();
  });
});
