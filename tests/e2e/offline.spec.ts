import { expect, test } from "@playwright/test";

test("cached application keeps the catalog and time controls available offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Explore our neighborhood" })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Solar System Atlas" })).toBeVisible();
  await page.getByLabel("Search celestial bodies").fill("Titan");
  await expect(page.getByRole("button", { name: /Titan/ })).toBeVisible();
  await expect(page.getByLabel("Simulation date")).toBeVisible();
});
