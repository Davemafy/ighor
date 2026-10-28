import { test, expect } from "@playwright/test";

test("the current workspace saves genuine corrections, reloads and preserves earlier context", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app");
  const composer = page.getByRole("textbox", { name: "Message Igor" });
  await composer.fill(
    "Plan a gathering for six friends, budget $60 and 180 minutes.",
  );
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".iw-message.iw-user")).toHaveCount(1);

  // The fixture provider is offline; all cultural associations must remain
  // clearly marked as illustrative rather than masquerading as live Qloo.
  const id = await page.evaluate(() => localStorage.getItem("igor-task"));
  expect(id).toBeTruthy();
  const initial = await (
    await page.request.get(`/api/tasks/${id}`)
  ).json();
  expect(initial.brief.constraints.budget).toBe(60);
  expect(initial.messages[0].text).toContain("Plan a gathering");
  expect(initial.mode).toBe("illustrative-fixtures");

  await composer.fill("Lower budget to $15");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".iw-message.iw-user")).toHaveCount(2);
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/tasks/${id}`);
      return (await response.json()).brief.constraints.budget;
    })
    .toBe(15);

  await page.reload();
  await expect(page.locator(".iw-message.iw-user")).toHaveCount(2);
  await expect(
    page.locator(".iw-message.iw-user").first(),
  ).toContainText("Plan a gathering");
  await expect(
    page.locator(".iw-message.iw-user").last(),
  ).toContainText("Lower budget to $15");
  const restored = await (
    await page.request.get(`/api/tasks/${id}`)
  ).json();
  expect(restored.brief.constraints.budget).toBe(15);
  expect(restored.messages.length).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});

test("mobile messaging supports keyboard entry, a saved reply and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  const composer = page.getByRole("textbox", { name: "Message Igor" });
  await expect(composer).toBeInViewport();
  await composer.focus();
  await page.keyboard.type("hey");
  await page.keyboard.press("Enter");
  await expect(page.locator(".iw-message.iw-assistant")).toContainText(
    "Hey! I’m Igor.",
  );
  await expect(page.locator(".iw-message.iw-user")).toContainText("hey");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator(".iw-message.iw-assistant")).toContainText(
    "Hey! I’m Igor.",
  );
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
