import { expect, test } from "@playwright/test";
import { freshTask } from "../../src/data/fixtures";
import { CandidateSchema } from "../../src/core/contracts";

test("the first screen offers an immediate action on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A world beyond your usual/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Find common ground" }),
  ).toBeEnabled();
  const composer = page.getByRole("textbox", {
    name: "What would you like to explore?",
  });
  await expect(composer).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(composer).toBeInViewport();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await composer.fill("A new direction");
  await expect(
    page.getByRole("button", { name: "Start exploring" }),
  ).toBeEnabled();
});

test("a sample journey refines, saves a reference and survives refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Find common ground" }).click();
  await page.getByRole("button", { name: /Explore Moonrise Kingdom/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(
      "An illustrative example, not a live cultural association.",
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Save reference" }).click();
  await expect(
    dialog.getByRole("button", { name: "Reference saved" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("textbox", { name: "Refine your discovery" })
    .fill("Budget: 20");
  await page.getByRole("button", { name: "Send refinement" }).click();
  await expect(page.locator(".ig-results")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Different tastes. Common ground." }),
  ).toBeVisible();
  const outputs = await page.evaluate(async () => {
    const id = localStorage.getItem("igor-task");
    const response = await fetch(`/api/tasks/${id}/outputs`);

    return response.json();
  });
  expect(
    outputs.collections.some(
      (item: { title: string }) => item.title === "Moonrise Kingdom",
    ),
  ).toBe(true);
});

test("workspace startup failures remain visible with a recovery action", async ({
  page,
}) => {
  await page.route("**/api/tasks", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "workspace could not start" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry workspace" }),
  ).toBeEnabled();
});

test("saved spaces supports Escape and restores focus", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Your spaces",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Your spaces" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("stale candidates are hidden and provider limitations stay inspectable", async ({
  page,
}) => {
  const task = freshTask("mock-discovery", "owner");
  task.brief.goal = "A synthetic browser test";
  task.brief.kind = "discovery";
  task.mode = "qloo-live";
  const reference = CandidateSchema.parse({
    ...task.catalogue[0],
    id: "current-film",
    name: "Synthetic film",
    sample: false,
    cultural: {
      test: {
        rank: 1,
        affinity: null,
        queryId: "synthetic-query",
        seedIds: [],
        explanationEntities: [],
        delivery: "LIVE",
        retrievedAt: "2026-10-25T00:00:00Z",
      },
    },
    eligibility: "needs-review",
    freshness: "current",
    missing: ["cost"],
    violations: [],
    dependencies: [],
    evidenceIds: [],
    fit: {},
    fitReason: "",
    cost: {
      value: null,
      source: "user-supplied",
      reference: "Not supplied",
      at: "2026-10-25T00:00:00Z",
    },
    available: null,
  });
  task.candidates = [
    reference,
    {
      ...reference,
      id: "stale-film",
      name: "Outdated film",
      freshness: "stale",
    },
  ];
  task.evidence = [
    {
      id: "test-evidence",
      source: "provider-returned",
      delivery: "LIVE",
      kind: "cultural",
      at: "2026-10-25T00:00:00Z",
      reference: "mock-only",
      entityIds: [],
      summary: "Synthetic response for browser test",
      limitations: ["No real Qloo request was made."],
      explanation: null,
      dependencies: [],
      freshness: "current",
    },
  ];
  await page.route("**/api/tasks", (route) => route.fulfill({ json: task }));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Explore Synthetic film" }),
  ).toBeVisible();
  await expect(page.getByText("Outdated film", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Explore Synthetic film" }).click();
  await page.getByText("Practical details", { exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("Unknown", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Not confirmed", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Behind the connections" }).click();
  await expect(
    page.getByRole("dialog").getByText("No real Qloo request was made."),
  ).toBeVisible();
});

test("a greeting gets a reply without discovery failure or an empty-results warning", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Find common ground", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "What would you like to explore?" })
    .fill("hey");
  await page
    .getByRole("button", { name: "Start exploring", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Igor’s reply" }),
  ).toContainText("Hey! I’m Igor.");
  await expect(
    page.getByText("A new direction needs a starting point.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Igor’s reply" }),
  ).toContainText("Hey! I’m Igor.");
});
