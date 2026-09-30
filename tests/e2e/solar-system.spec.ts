import { expect, test } from "@playwright/test";

test("exhibition guide supports search, selection, time and scale controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Explore our neighborhood" })).toBeVisible();
  await page.getByLabel("Search celestial bodies").fill("Saturn");
  await page.getByRole("button", { name: /Saturn/ }).click();
  await expect(page.getByRole("heading", { name: "Saturn" })).toBeVisible();
  await page.getByLabel("Search celestial bodies").fill("Titan");
  await page.getByRole("button", { name: /Titan/ }).click();
  await expect(page.getByTestId("scene-target")).toHaveText("titan");
  await page.getByLabel("Simulation date").fill("2026-09-30");
  await expect(page.getByLabel("Simulation date")).toHaveValue("2026-09-30");
  await page.getByLabel("Scale mode").selectOption("visible");
  await expect(page.getByText(/Body sizes enhanced for visibility/)).toBeVisible();
  await page.getByLabel("Scale mode").selectOption("exhibition");
  await expect(page.getByText(/non-linearly/)).toBeVisible();
  await page.getByLabel("Simulation speed").selectOption("-86400");
  await expect(page.getByLabel("Simulation speed")).toHaveValue("-86400");
  await page.getByLabel("Orbits", { exact: false }).uncheck();
});
