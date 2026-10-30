import { expect, test } from "@playwright/test";

test("cinematic Home accepts arbitrary editable prompts without domain intake", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Your agent.*With taste/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Research a topic" })).toBeVisible();
  await page.getByRole("button", { name: "Research a topic" }).click();
  await expect(page.getByRole("textbox", { name: "Message Igor" })).toHaveValue(/research a topic/);
  await page.getByRole("textbox", { name: "Message Igor" }).fill("Explain the major differences between two database indexes.");
  await expect(page.getByRole("textbox", { name: "Message Igor" })).toHaveValue(/database indexes/);
  await page.screenshot({ path: "test-results/reference-native-home-desktop.png" });
});

test("Discover opens in the same authenticated workspace, with honest empty results", async ({ page }) => {
  await page.goto("/app?view=explore");
  await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search real discovered candidates" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Product navigation" }).getByRole("button", { name: "Create" })).toBeVisible();
  await page.screenshot({ path: "test-results/reference-native-discover-desktop.png" });
});

test("mobile navigation keeps all primary actions accessible without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  const nav = page.getByRole("navigation", { name: "Product navigation" });
  for (const name of ["Home", "Explore", "Create", "Search", "Library"]) {
    await expect(nav.getByRole("button", { name })).toBeVisible();
  }
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
  await page.screenshot({ path: "test-results/reference-native-home-mobile.png" });
  await nav.getByRole("button", { name: "Explore" }).click();
  await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
  await page.screenshot({ path: "test-results/reference-native-discover-mobile.png" });
});
