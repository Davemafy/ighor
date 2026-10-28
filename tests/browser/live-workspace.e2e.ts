import { test, expect } from "@playwright/test";
import { freshLiveExample } from "../../src/data/live-task";

test("unconfigured production tools preserve the user turn without inventing Qloo results", async ({
  page,
}) => {
  // Keep API creation and page access in the same browser session. An
  // isolated Playwright request context correctly cannot read its tasks.
  const created = await page.request.post("/api/tasks");
  expect(created.ok()).toBe(true);
  const task = await created.json();
  expect(task.mode).toBe("qloo-live");
  expect(task.catalogue).toEqual([]);
  expect(task.candidates).toEqual([]);
  expect(task.evidence).toEqual([]);
  await page.addInitScript(
    (id) => localStorage.setItem("igor-task", id),
    task.id,
  );
  await page.goto("/app");
  const composer = page.getByRole("textbox", { name: "Message Igor" });
  await composer.fill("Find a cultural experience for my friends.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".iw-message.iw-user")).toContainText(
    "Find a cultural experience for my friends.",
  );
  await expect(page.locator(".iw-error")).toBeVisible();
  const read = await page.request.get(`/api/tasks/${task.id}`);
  expect(read.ok()).toBe(true);
  const stored = await read.json();
  expect(Array.isArray(stored.messages)).toBe(true);
  expect(stored.messages.at(-1)?.role).toBe("user");
  expect(stored.catalogue).toEqual([]);
  expect(stored.candidates).toEqual([]);
  expect(stored.evidence).toEqual([]);
  expect(stored.error).toBeTruthy();

  await page.reload();
  await expect(page.locator(".iw-message.iw-user")).toContainText(
    "Find a cultural experience for my friends.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("cached Qloo evidence is disclosed without inventing practical availability", async ({
  page,
}) => {
  const task = freshLiveExample("mock-provider", "owner");
  task.brief.goal = "Inspect a cached cultural reference";
  task.status = "partial";
  task.messages = [
    {
      role: "user",
      text: "Can I book the screening?",
      at: "2026-10-24T00:00:00Z",
    },
    {
      role: "assistant",
      kind: "conversation",
      text: "The cultural association was cached. Screening availability and bookings have not been verified.",
      evidenceIds: ["mock-cached-qloo"],
      at: "2026-10-24T00:00:01Z",
    },
  ];
  task.evidence = [
    {
      id: "mock-cached-qloo",
      source: "provider-returned",
      delivery: "CACHED",
      kind: "cultural",
      at: "2026-10-24T00:00:00Z",
      reference: "mock-recording-only",
      entityIds: [],
      summary: "Recorded Qloo association for offline browser test",
      limitations: [
        "CACHED recording; no live request.",
        "No screening availability or booking is verified.",
      ],
      explanation: null,
      dependencies: [],
      freshness: "current",
    },
  ];
  await page.route("**/api/tasks", (route) => route.fulfill({ json: task }));
  await page.goto("/app");
  await expect(page.locator(".iw-message.iw-assistant")).toContainText(
    "bookings have not been verified.",
  );
  const sources = page.locator(".iw-message-sources");
  await sources.locator("summary").click();
  await expect(sources).toContainText("Qloo");
  await expect(sources).toContainText("CACHED recording; no live request.");
  await expect(sources).toContainText(
    "No screening availability or booking is verified.",
  );
  await expect(sources.getByRole("link")).toHaveCount(0);
});
