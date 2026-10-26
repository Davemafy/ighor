import { test, expect } from "@playwright/test";
import { freshLiveTask } from "../../src/data/live-task";

test("default production path has no catalogue and reports blocked retrieval honestly", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/tasks");
  const task = await created.json();
  expect(task.mode).toBe("qloo-live");
  expect(task.catalogue).toEqual([]);
  await page.goto("/workspace");
  await expect(
    page.getByText("Qloo connection", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "A shorter evening" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "A smaller budget" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try the six-person evening" })
    .click();
  await expect(page.getByRole("status")).toContainText("0 external requests");
  await page.getByRole("tab", { name: /Options/ }).click();
  await expect(
    page.getByRole("button", { name: "Compare with LLM-only" }),
  ).toBeDisabled();
  await expect(page.locator(".options-table tbody tr")).toHaveCount(0);
  await expect(page.getByLabel("Fixture provider behavior")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("cached evidence, practical-fact entry and blocked baseline render through mocked workspace HTTP", async ({
  page,
}) => {
  const task = freshLiveTask("mock", "owner");
  task.brief.goal = "Synthetic UI test only";
  const at = "2026-10-24T00:00:00Z";
  const candidate = {
    id: "22222222-2222-4222-8222-222222222222",
    providerId: "22222222-2222-4222-8222-222222222222",
    name: "Mock film",
    type: "movie" as const,
    tags: [],
    description: "Synthetic UI test response, not a live Qloo result.",
    cost: {
      value: null as number | null,
      source: "user-supplied" as const,
      reference: "Not supplied",
      at,
    },
    duration: {
      value: null as number | null,
      source: "user-supplied" as const,
      reference: "Not supplied",
      at,
    },
    available: null as boolean | null,
    availabilitySource: "user-supplied" as const,
    location: null,
    sample: false,
    cultural: {
      amara: {
        affinity: 0.72,
        rank: 1,
        queryId: "mock-query",
        seedIds: [],
        explanationEntities: [],
        delivery: "CACHED" as const,
        retrievedAt: at,
      },
    },
  };
  task.catalogue = [candidate];
  task.candidates = [
    {
      ...candidate,
      eligibility: "needs-review",
      dependencies: [],
      freshness: "current",
      missing: ["Cost unknown"],
      violations: [],
      evidenceIds: [],
      fit: { amara: 1 },
      fitReason: "Synthetic transport fixture.",
    },
  ];
  task.status = "partial";
  await page.route("**/api/tasks", async (route) =>
    route.fulfill({ json: task }),
  );
  await page.route("**/api/tasks/mock/turn", async (route) => {
    const input = route.request().postDataJSON();

    if (input.type === "catalogue") {
      expect(input.options[0].cost.value).toBe(7);
      expect(input.options[0].duration.value).toBe(80);
      expect(input.options[0].available).toBe(true);
      task.catalogue = input.options;
      task.candidates[0] = { ...task.candidates[0], ...input.options[0] };
    } else if (input.type === "baseline") {
      task.evaluation = {
        version: task.brief.version + 1,
        status: "blocked",
        baseline: [],
        assisted: [],
        warnings: ["Model is not configured."],
        model: "unconfigured",
        at,
      };
    }

    task.brief.version++;
    await route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ type: "done", task })}\n\n`,
    });
  });
  await page.goto("/workspace");
  await page.getByRole("tab", { name: /Options/ }).click();
  await page.getByText("Mock film", { exact: true }).first().click();
  await expect(page.getByText(/affinity 0.72/)).toBeVisible();
  await page.getByLabel("Cost for Mock film", { exact: true }).fill("7");
  await page.getByLabel("Minutes for Mock film", { exact: true }).fill("80");
  await page
    .getByLabel("Access for Mock film", { exact: true })
    .selectOption("yes");
  await page.getByRole("button", { name: "Save practical facts" }).click();
  await page.getByRole("button", { name: "Compare with LLM-only" }).click();
  await expect(page.getByText(/Model is not configured/)).toBeVisible();
  await page.screenshot({
    path: "test-results/live-options-mocked.png",
    fullPage: true,
  });
});
