import { expect, test } from "@playwright/test";

test("renderer failure leaves navigation usable and offers recovery", async ({ page }) => {
  await page.goto("/");
  const recovery = page.getByRole("button", { name: "Try renderer again" });
  if (await recovery.count()) {
    await expect(recovery).toBeVisible();
    await recovery.click();
  } else {
    await page.locator("canvas").dispatchEvent("webglcontextlost", { bubbles: false, cancelable: true });
    await expect(page.getByText(/Graphics context was interrupted/)).toBeVisible();
    await expect(recovery).toBeVisible();
  }
  await page.getByLabel("Search celestial bodies").fill("Titan");
  await page.getByRole("button", { name: /Titan/ }).click();
  await expect(page.getByTestId("scene-target")).toHaveText("titan");
});
