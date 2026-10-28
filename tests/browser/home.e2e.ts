import { expect, test } from "@playwright/test";
import { freshTask } from "../../src/data/fixtures";

test("the current first screen offers usable conversation starters on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: /What.s on\s+your mind/i }),
  ).toBeVisible();

  const composer = page.getByRole("textbox", { name: "Message Igor" });
  const desktopAudit = await page.evaluate(() => {
    const element = document.querySelector("#iw-message");
    const rect = element?.getBoundingClientRect();

    return {
      pathname: location.pathname,
      apps: document.querySelectorAll(".iw-app").length,
      welcomes: document.querySelectorAll(".iw-welcome").length,
      composers: document.querySelectorAll(".iw-composer").length,
      textareas: document.querySelectorAll("textarea").length,
      headings: document.querySelectorAll("h1").length,
      exists: !!element,
      rect: rect
        ? {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
        : null,
      scrollY: Math.round(window.scrollY),
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });
  const labeledComposers = await composer.count();
  expect(
    labeledComposers,
    `Desktop composer count=${labeledComposers} path=${desktopAudit.pathname} app=${desktopAudit.apps} welcome=${desktopAudit.welcomes} composers=${desktopAudit.composers} textareas=${desktopAudit.textareas} headings=${desktopAudit.headings} rect=${JSON.stringify(desktopAudit.rect)}`,
  ).toBe(1);
  await expect(
    composer,
    `Desktop composer geometry: ${JSON.stringify(desktopAudit)}`,
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: /A thoughtful gift/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /Something together/ }).click();
  await expect(composer).toHaveValue(
    "Plan something great with friends. Use the details I provide to explore real options, show a sourced shortlist, and save a usable plan. Ask only for essential missing information.",
  );
  await expect(
    page.getByRole("button", { name: "Send message" }),
  ).toBeEnabled();

  // A clean mobile load is the real first-impression scenario. Resizing
  // a focused desktop textbox can preserve an unrelated scroll position.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Message Igor" }),
    "Mobile composer must be visible without scrolling on first load",
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("a conversation survives refresh, a new thread, and history reopening", async ({
  page,
}) => {
  await page.goto("/app");
  const composer = page.getByRole("textbox", { name: "Message Igor" });
  await composer.fill("hey");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".iw-message.iw-assistant")).toContainText(
    "Hey! I’m Igor.",
  );
  const savedId = await page.evaluate(() => localStorage.getItem("igor-task"));
  expect(savedId).toBeTruthy();

  await page.reload();
  await expect(page.locator(".iw-message.iw-user")).toContainText("hey");
  await expect(page.locator(".iw-message.iw-assistant")).toContainText(
    "Hey! I’m Igor.",
  );

  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(
    page.getByRole("heading", { name: /What.s on\s+your mind/i }),
  ).toBeVisible();
  const newId = await page.evaluate(() => localStorage.getItem("igor-task"));
  expect(newId).not.toBe(savedId);

  await page.getByRole("button", { name: "Conversations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conversations", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".iw-history-list button").first()).toBeVisible();
  await page.locator(".iw-history-list button").first().click();
  await expect(page.locator(".iw-message.iw-assistant")).toContainText(
    "Hey! I’m Igor.",
  );
});

test("workspace startup failures remain visible with a recovery action", async ({
  page,
}) => {
  await page.route("**/api/tasks", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/app");
  await expect(
    page.getByRole("alert").filter({ hasText: "workspace could not start" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry workspace" }),
  ).toBeEnabled();
});

test("mobile navigation closes with Escape and restores keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  await expect(page.locator("#iw-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#iw-menu")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
});

test("recorded cultural evidence keeps its source and limitations inspectable", async ({
  page,
}) => {
  const task = freshTask("mock-source", "owner");
  task.mode = "qloo-live";
  task.brief.goal = "Why these cultural references?";
  task.messages = [
    {
      role: "user",
      text: "Why these cultural references?",
      at: "2026-10-25T00:00:00Z",
    },
    {
      role: "assistant",
      kind: "conversation",
      text: "The cultural references are saved for inspection.",
      evidenceIds: ["mock-qloo-evidence"],
      at: "2026-10-25T00:00:01Z",
    },
  ];
  task.evidence = [
    {
      id: "mock-qloo-evidence",
      source: "provider-returned",
      delivery: "CACHED",
      kind: "cultural",
      at: "2026-10-25T00:00:00Z",
      reference: "mock-recorded-qloo-source",
      entityIds: [],
      summary: "Recorded cultural response for browser verification",
      limitations: ["No new live Qloo request was made."],
      explanation: null,
      dependencies: [],
      freshness: "current",
    },
  ];
  await page.route("**/api/tasks", (route) => route.fulfill({ json: task }));
  await page.goto("/app");

  const receipt = page.locator(".iw-message-sources");
  await expect(receipt.locator("summary")).toContainText("Sources");
  await receipt.locator("summary").click();
  await expect(receipt).toContainText("Qloo");
  await expect(receipt).toContainText("No new live Qloo request was made.");
  await expect(receipt).not.toContainText("Web source");
});

test("ordinary greetings and topic changes produce saved replies without fake discovery", async ({
  page,
}) => {
  await page.goto("/app");
  const composer = page.getByRole("textbox", { name: "Message Igor" });
  await composer.fill("hey");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".iw-message.iw-assistant").last()).toContainText(
    "Hey! I’m Igor.",
  );
  await composer.fill("what can you do?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".iw-message.iw-assistant").last()).toContainText(
    "agent with taste",
  );
  await expect(
    page.locator(".iw-message.iw-user"),
    "Before reload, both user turns must be visible",
  ).toHaveCount(2);

  await page.reload();
  await expect(
    page.locator(".iw-message.iw-user"),
    "After reload, both user turns must be restored",
  ).toHaveCount(2);
  await expect(
    page.locator(".iw-message.iw-assistant"),
    "After reload, both assistant replies must be restored",
  ).toHaveCount(2);
  const alertSnapshot = await page.locator('[role="alert"]').evaluateAll(
    (nodes) =>
      nodes.map((node) => ({
        className: node.className,
        visible: !!(node as HTMLElement).offsetParent,
      })),
  );
  await expect(
    page.locator(".iw-error"),
    `After reload, no actionable workspace error. Alerts: ${JSON.stringify(alertSnapshot)}`,
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
