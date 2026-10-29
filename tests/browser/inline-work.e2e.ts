import { test, expect, type Page } from "@playwright/test";

async function sendMessage(page: Page, message: string) {
  const composer = page.getByRole("textbox", { name: "Message Igor" });
  await expect(composer).toBeEnabled();
  const before = await page.locator(".iw-message.iw-assistant").count();
  await composer.fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect
    .poll(() => page.locator(".iw-message.iw-assistant").count(), {
      timeout: 30000,
    })
    .toBeGreaterThan(before);
  await expect(composer).toBeEnabled();
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`real saved work belongs to the conversation, not a right panel (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/app");
    await sendMessage(page, "hey");
    await sendMessage(
      page,
      "I want to launch a small listening bar for people into alternative music and independent art. Help me make it distinctive without overspending.",
    );

    const result = page.getByRole("region", { name: "Your work" });
    await expect(result).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".iw-messages .iw-inline-output")).toHaveCount(1);
    await expect(page.locator(".iw-work-stage")).toHaveCount(0);
    await expect(page.locator(".iw-pane-switch")).toHaveCount(0);
    await expect(page.locator(".iw-thread")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Message Igor" }),
    ).toBeVisible();
    await expect(page.locator(".iw-inline-output .ic-canvas")).toBeVisible();
    await expect(result).toBeInViewport({ ratio: 0.05 });
    expect(
      await page.locator(".iw-workgrid").evaluate((element) => {
        const style = getComputedStyle(element);

        return (
          style.display !== "grid" ||
          style.gridTemplateColumns.split(" ").length === 1
        );
      }),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/inline-work-${viewport.width}.png`,
      animations: "disabled",
    });
  });
}
