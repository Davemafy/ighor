import { test, expect } from "@playwright/test";

test("full workspace, revision engine, failure recovery and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Try the six-person evening" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Try the six-person evening" })
    .click();
  await expect(page.getByText("Current · fixture-backed")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The evening, considered" }),
  ).toBeVisible();
  await expect(page.locator(".participant")).toHaveCount(6);
  await expect(
    page.getByText("Facts & assumptions", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".timeline-row")).toHaveCount(4);
  const calls = await page.locator(".execution-progress").innerText();
  expect(calls).toContain("1 fixture discovery");
  await page.getByRole("tab", { name: /Options/ }).click();
  await expect(
    page.getByText("The unconfirmed screening", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Needs review", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Programme", exact: true }).click();
  await page.getByLabel("Group budget", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Update brief" }).click();
  await expect(page.getByRole("status")).toContainText("1 fixture discovery");
  await expect(page.locator(".prose")).toContainText("No complete selection");
  await page.getByLabel("Group budget", { exact: true }).fill("60");
  await page.getByRole("button", { name: "Update brief" }).click();
  await expect(page.locator(".timeline-row")).toHaveCount(4);
  await page.getByRole("tab", { name: "Invitation", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Edit invitation" })
    .fill("A good evening. Bring your curiosity.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 fixture discovery");
  await page.reload();
  await page.getByRole("tab", { name: "Invitation", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Edit invitation" }),
  ).toHaveValue("A good evening. Bring your curiosity.");
  await page.locator(".participant summary").first().click();
  await page
    .getByRole("textbox", { name: "Amara likes", exact: true })
    .fill("jazz, warm");
  await page.getByRole("button", { name: "Save Amara’s preferences" }).click();
  await expect(page.getByRole("status")).toContainText("2 fixture discovery");
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await page.getByLabel("Fixture provider behavior").selectOption("timeout");
  await expect(
    page.getByRole("region", { name: "Conversation" }).getByRole("alert"),
  ).toContainText("timed out");
  await page.getByLabel("Fixture provider behavior").selectOption("none");
  await expect(
    page.getByRole("region", { name: "Conversation" }).getByRole("alert"),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Programme", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/workspace-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("mobile layout and keyboard entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace");
  await expect(
    page.getByRole("button", { name: "Try the six-person evening" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Try the six-person evening" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Current · fixture-backed")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tell Igor your goal or correction" })
    .focus();
  await page.keyboard.type("Invitation: A quieter night, together.");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("1 fixture discovery");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/workspace-mobile.png",
    fullPage: true,
  });
});

test("HTTP ownership, input validation and stale request rejection", async ({
  request,
}) => {
  const created = await request.post("/api/tasks");
  expect(created.ok()).toBe(true);
  const t = await created.json();
  const invalid = await request.post(`/api/tasks/${t.id}/turn`, {
    data: { type: "shell", version: 0 },
  });
  expect(invalid.status()).toBe(400);
  const good = await request.post(`/api/tasks/${t.id}/turn`, {
    data: { type: "sample", version: 0 },
  });
  expect(good.ok()).toBe(true);
  expect(await good.text()).toContain('"type":"done"');
  const stale = await request.post(`/api/tasks/${t.id}/turn`, {
    data: { type: "sample", version: 0 },
  });
  expect(stale.status()).toBe(409);
  const forbidden = await request.post("/api/tasks", {
    headers: { origin: "https://evil.example" },
  });
  expect(forbidden.status()).toBe(400);
  const foreign = await request.get(`/api/tasks/${t.id}`, {
    headers: { cookie: "igor_session=00000000-0000-0000-0000-000000000000" },
  });
  expect(foreign.status()).toBe(404);
});
