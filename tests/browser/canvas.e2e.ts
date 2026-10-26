import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import {
  PresentationSchema,
  installPresentation,
} from "../../src/core/presentation";
import type { Task } from "../../src/core/contracts";

test("composed work persists through edits, filtering, planning, maps and refresh", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Stub Google itself, never the task mutation API. No billable Maps or Qloo calls.
  await page.route("**/api/maps/config", (route) =>
    route.fulfill({ json: { browserKey: "test-browser-key" } }),
  );
  await page.addInitScript(() => {
    class MapMock extends HTMLElement {
      center = { lat: 40.73, lng: -73.99, altitude: 0 };
      range = 1800;
      tilt = 55;
      heading = 0;
      constructor() {
        super();
        this.setAttribute("data-google-map-test-double", "true");
        setTimeout(
          () =>
            this.dispatchEvent(
              Object.assign(new Event("gmp-steadychange"), { isSteady: true }),
            ),
          50,
        );
      }
      flyCameraTo(options: {
        endCamera: { center: { lat: number; lng: number; altitude: number } };
      }) {
        this.center = options.endCamera.center;
        this.setAttribute("data-last-lat", String(this.center.lat));
      }
      stopCameraAnimation() {}
    }
    class MarkerMock extends HTMLElement {
      constructor(options: { label: string }) {
        super();
        this.textContent = options.label;
        this.tabIndex = 0;
        this.addEventListener("click", () =>
          this.dispatchEvent(new Event("gmp-click")),
        );
      }
    }
    customElements.define("igor-map-mock", MapMock);
    customElements.define("igor-marker-mock", MarkerMock);
    Object.assign(window, {
      google: {
        maps: {
          importLibrary: async () => ({
            Map3DElement: MapMock,
            Marker3DInteractiveElement: MarkerMock,
          }),
        },
      },
    });
  });
  const created = await page.request.post("/api/tasks", {
    headers: { Origin: "http://127.0.0.1:3500" },
  });
  expect(created.ok()).toBeTruthy();
  const task = (await created.json()) as Task;
  task.messages = [
    {
      role: "user",
      text: "Prepare a product launch plan using my supplied data.",
      at: new Date().toISOString(),
    },
    {
      role: "assistant",
      kind: "conversation",
      text: "Here is the draft, your supplied comparison and a plan you can edit.",
      at: new Date().toISOString(),
    },
  ];
  task.brief.goal = "Prepare a product launch";
  task.canvas = installPresentation(
    undefined,
    PresentationSchema.parse({
      id: "launch",
      title: "A launch worth making",
      basis: "user-supplied",
      root: "root",
      nodes: [
        {
          id: "root",
          type: "stack",
          children: [
            "draft",
            "timeline",
            "data",
            "chart",
            "spatial",
            "activity",
          ],
        },
        {
          id: "draft",
          type: "document",
          title: "Launch brief",
          content:
            "# Start with the people\n\nInvite a small beta group and learn what matters.",
        },
        {
          id: "timeline",
          type: "timeline",
          title: "The plan",
          items: [
            {
              id: "prepare",
              label: "Prepare beta",
              detail: "Pick the first group.",
            },
            {
              id: "launch",
              label: "Launch beta",
              detail: "Send the invitations.",
            },
          ],
        },
        {
          id: "data",
          type: "table",
          title: "Supplied effort",
          columns: ["Stage", "Hours"],
          rows: [
            { id: "beta", cells: ["Beta", "8"] },
            { id: "public", cells: ["Public launch", "12"] },
          ],
        },
        {
          id: "chart",
          type: "chart",
          title: "Effort by stage",
          tableId: "data",
          labelColumn: 0,
          valueColumn: 1,
          unit: "hours",
        },
        {
          id: "spatial",
          type: "spatial",
          title: "Supplied meeting places",
          candidateIds: ["venue-one", "venue-two"],
        },
        { id: "activity", type: "activity", title: "What happened" },
      ],
    }),
  );
  task.candidates = [1, 2].map((i) => ({
    id: `venue-${i === 1 ? "one" : "two"}`,
    name: `Supplied venue ${i}`,
    type: "place",
    providerId: null,
    tags: [],
    description: "Location supplied for this test. Not verified venue data.",
    cost: {
      value: null,
      source: "user-supplied",
      reference: "Test input",
      at: new Date().toISOString(),
    },
    duration: {
      value: null,
      source: "user-supplied",
      reference: "Test input",
      at: new Date().toISOString(),
    },
    available: null,
    availabilitySource: "user-supplied",
    location: "New York",
    sample: true,
    freshness: "current",
    eligibility: "needs-review",
    dependencies: [],
    missing: [],
    violations: [],
    evidenceIds: [],
    fit: {},
    fitReason: "User supplied",
    place: {
      latitude: 40.73 + i / 1000,
      longitude: -73.99,
      address: "New York",
      website: null,
      locality: null,
    },
  }));
  const db = new DatabaseSync(".igor/canvas-e2e/tasks.sqlite");
  db.prepare("UPDATE tasks SET state=? WHERE id=?").run(
    JSON.stringify(task),
    task.id,
  );
  db.close();
  await page.addInitScript(
    (id) => localStorage.setItem("igor-task", id),
    task.id,
  );
  await page.goto(`/app?view=conversation&task=${task.id}`);
  const canvas = page.getByRole("complementary", { name: "Task canvas" });
  await expect(
    canvas.getByRole("heading", { name: "A launch worth making" }),
  ).toBeVisible();
  await canvas.getByRole("button", { name: "Edit draft", exact: true }).click();
  await canvas
    .getByRole("textbox", { name: "Edit Launch brief" })
    .fill("# Invite-only launch\n\nStart with 20 users.");
  await expect(canvas.locator(".ic-paper")).toContainText(
    "Start with 20 users.",
  );
  await canvas
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    canvas.getByText("Unsaved changes", { exact: true }),
  ).toHaveCount(0);
  await canvas
    .getByRole("button", { name: "Move Launch beta earlier" })
    .click();
  await expect(canvas.locator(".ic-timeline>li").first()).toContainText(
    "Launch beta",
  );
  await canvas.getByRole("checkbox").first().click();
  await expect(canvas.getByRole("checkbox").first()).toBeChecked();
  await canvas
    .getByRole("textbox", { name: "Filter Supplied effort" })
    .fill("Beta");
  await canvas.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(canvas.locator("tbody tr")).toHaveCount(1);
  await expect(canvas.locator(".ic-chart>div")).toHaveCount(1);
  await canvas.getByRole("button", { name: "Explore in 3D" }).click();
  await expect(page.locator("[data-google-map-test-double]")).toBeVisible();
  await canvas
    .getByRole("button", { name: "Supplied venue 2", exact: true })
    .click();
  await expect(
    canvas.getByRole("button", { name: "Supplied venue 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await canvas
    .getByRole("button", { name: "Add to your plan", exact: true })
    .click();
  await expect(canvas.locator(".ic-map-plan")).toContainText(
    "Supplied venue 2",
  );
  const saved = (await (
    await page.request.get(`/api/tasks/${task.id}`)
  ).json()) as Task;
  expect(saved.canvas?.itineraryIds).toEqual(["venue-two"]);
  expect(saved.canvas?.selectedCandidateId).toBe("venue-two");
  expect(
    saved.canvas?.surface.nodes.find((n) => n.id === "draft"),
  ).toMatchObject({ content: "# Invite-only launch\n\nStart with 20 users." });
  await page.reload();
  await expect(canvas.locator(".ic-paper")).toContainText(
    "Start with 20 users.",
  );
  await expect(canvas.getByRole("checkbox").first()).toBeChecked();
  await expect(canvas.locator(".ic-map-plan")).toContainText(
    "Supplied venue 2",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await canvas.evaluate((el) => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 105,
      behavior: "instant",
    });
  });
  await page.evaluate(() => document.fonts.ready);
  mkdirSync("test-results/canvas", { recursive: true });
  await page.screenshot({
    path: `test-results/canvas/${info.project.name}.png`,
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Open your work", exact: true })
    .click();
  await canvas.getByRole("button", { name: "Edit draft", exact: true }).click();
  const editor = canvas.getByRole("textbox", { name: "Edit Launch brief" });
  await editor.fill("Keep this draft when the save fails.");
  await page.route(
    "**/api/tasks/*/turn",
    (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Temporarily unavailable" },
      }),
    { times: 1 },
  );
  await canvas
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Your draft is still here" }),
  ).toContainText("Your draft is still here");
  await expect(editor).toHaveValue("Keep this draft when the save fails.");
  await canvas
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    canvas.getByText("Unsaved changes", { exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/view=editor/);
  expect(errors).toEqual([]);
});
