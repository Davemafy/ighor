import { expect, test } from "@playwright/test";
import { freshLiveTask } from "../../src/data/live-task";

test("new Igor home starts from a goal without onboarding", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /One thing you love/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Follow a sound into a city/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /Find everyone's kind of night/ }),
  ).toBeEnabled();

  await page
    .getByRole("button", { name: /Tell Igor what's on your mind/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "What would you like Igor to explore?" }),
  ).toBeFocused();
});

test("result uses supplied provider evidence without inventing facts", async ({
  page,
}) => {
  const task = freshLiveTask("mock-workspace", "owner");
  const at = "2026-10-25T00:00:00.000Z";
  const providerId = "22222222-2222-4222-8222-222222222222";

  task.brief.goal = "Find films connected to my music taste";
  task.brief.kind = "discovery";
  task.brief.targetType = "movie";
  task.status = "partial";
  task.catalogue = [
    {
      id: "mock-film",
      providerId,
      name: "Example film",
      type: "movie",
      tags: ["cinema"],
      description: "A test association, not a verified personal preference.",
      cost: {
        value: null,
        source: "user-supplied",
        reference: "Not supplied",
        at,
      },
      duration: {
        value: null,
        source: "user-supplied",
        reference: "Not supplied",
        at,
      },
      available: null,
      availabilitySource: "user-supplied",
      location: null,
      sample: false,
      cultural: {
        amara: {
          affinity: null,
          rank: 1,
          queryId: "synthetic-query",
          seedIds: [],
          explanationEntities: [],
          delivery: "LIVE",
          retrievedAt: at,
        },
      },
    },
  ];
  task.evidence = [
    {
      id: "synthetic-evidence",
      kind: "cultural",
      source: "provider-returned",
      delivery: "LIVE",
      at,
      reference: "mock-test-only",
      entityIds: [providerId],
      summary: "Synthetic response for browser test.",
      limitations: ["No real Qloo request was made."],
      explanation: null,
      dependencies: [],
      freshness: "current",
    },
  ];

  await page.route("**/api/tasks", async (route) => {
    await route.fulfill({ json: task });
  });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Where it leads." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Example film/ }).click();

  await expect(page.getByText("Cost", { exact: true })).toBeVisible();
  await expect(page.getByText("Unknown", { exact: true })).toBeVisible();
  await expect(page.getByText("Not confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("No real Qloo request was made.")).toHaveCount(0);
  await expect(page.getByText("1 live", { exact: true })).toBeVisible();
});