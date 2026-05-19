import { test, expect } from "@playwright/test";

test.describe("public smoke", () => {
  test("home page loads with app title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Linksy/i);
  });
});
