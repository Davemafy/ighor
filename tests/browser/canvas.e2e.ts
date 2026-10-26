import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
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
    const sample = { layoutShift: 0, longTasks: 0, longestTaskMs: 0 };
    Object.assign(window, { __igorInteractionMetrics: sample });
    if ("PerformanceObserver" in window) {
      try {
        const shift = new PerformanceObserver((items) => {
          for (const item of items.getEntries()) {
            const entry = item as PerformanceEntry & {
              hadRecentInput?: boolean;
              value?: number;
            };
            if (!entry.hadRecentInput) sample.layoutShift += entry.value ?? 0;
          }
        });
        shift.observe({type: "layout-shift", buffered: true});
        const tasks = new PerformanceObserver((items) => {
          for (const item of items.getEntries()) {
            sample.longTasks += 1;
            sample.longestTaskMs = Math.max(sample.longestTaskMs, item.duration);
          }
        });
        tasks.observe({type: "longtask", buffered: true});
      } catch {
        // Browser support differs. Record zero only when no entries are delivered.
      }
    }
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
    class Map2DMock {
      constructor(private host: HTMLElement) {
        host.setAttribute("data-google-2d-test-double", "true");
      }
      panTo(center: {lat: number; lng: number}) {
        this.host.setAttribute("data-pan-lat", String(center.lat));
      }
    }
    class Marker2DMock {
      private button = document.createElement("button");
      private handler: (() => void) | null = null;
      constructor(options: {map: Map2DMock; title: string}) {
        this.button.textContent = options.title;
        this.button.setAttribute("aria-label", options.title);
        (options.map as unknown as {host: HTMLElement}).host.append(this.button);
        this.button.addEventListener("click", () => this.handler?.());
      }
      addListener(_event: string, cb: () => void) {
        this.handler = cb;
        return {remove: () => {this.handler = null;}};
      }
      setMap(_map: null) {this.button.remove();}
      setOpacity(value: number) {this.button.dataset.opacity = String(value);}
      setZIndex(value: number) {this.button.dataset.zIndex = String(value);}
    }
    customElements.define("igor-map-mock", MapMock);
    customElements.define("igor-marker-mock", MarkerMock);
    Object.assign(window, {
      google: {
        maps: {
          importLibrary: async (name: string) =>
            name === "maps3d"
              ? {
                  Map3DElement: MapMock,
                  Marker3DInteractiveElement: MarkerMock,
                }
              : name === "maps"
                ? {Map: Map2DMock}
                : {Marker: Marker2DMock},
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
          columns: ["Stage", "Hours", "Estimated cost"],
          rows: [
            { id: "beta", cells: ["Beta", "8", "3"] },
            { id: "public", cells: ["Public launch", "12", "5"] },
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
  const mobile = info.project.name.startsWith("mobile");
  const evidence = async (name: string) => {
    if (!mobile) return;
    mkdirSync("test-results/canvas/mobile-quality", { recursive: true });
    await page.screenshot({
      path: `test-results/canvas/mobile-quality/${info.project.name}-${name}.png`,
      fullPage: false,
    });
  };
  const canvas = page.getByRole("complementary", { name: "Task canvas" });
  if (mobile) {
    const transcriptTab = page.getByRole("tab", { name: "Conversation" });
    const canvasTab = page.getByRole("tab", { name: "Your result" });
    await transcriptTab.click();
    await expect(transcriptTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Prepare a product launch plan using my supplied data.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Product navigation" })).toBeHidden();
    const composer = page.getByRole("textbox", { name: "Message Igor" });
    await expect(composer).toBeVisible();
    const inputBox = await composer.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height + 1,
    );
    await evidence("01-conversation");
    await canvasTab.click();
    await expect(canvasTab).toHaveAttribute("aria-selected", "true");
    await expect(canvas).toBeVisible();
    await evidence("02-result-morph");
    if (info.project.name === "mobile") {
      await evidence("07-reduced-motion");
    }
    // Simulate an occupied mobile keyboard viewport; the composer must reflow
    // without covering the result. Real keyboard behavior requires device QA.
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--igor-visible-height", "600px"),
    );
    await expect(composer).toBeVisible();
    const composerFrame = await page.locator(".ip-conversation-composer").boundingBox();
    expect(composerFrame).not.toBeNull();
    expect(composerFrame!.y + composerFrame!.height).toBeLessThanOrEqual(601);
    await evidence("06-keyboard-viewport-simulated");
    await page.evaluate(() =>
      document.documentElement.style.removeProperty("--igor-visible-height"),
    );
  }
  await expect(canvas).toBeVisible();
  await expect(
    canvas.getByRole("heading", { name: "A launch worth making" }),
  ).toBeVisible();
  if (mobile) {
    await canvas.getByRole("button", { name: "Expand canvas" }).click();
    await expect(canvas).toHaveClass(/ic-fullscreen/);
    await evidence("03-expanded-artifact");
    await canvas.getByRole("button", { name: "Exit full screen canvas" }).click();
    await expect(canvas).not.toHaveClass(/ic-fullscreen/);
  }
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
  await evidence("04-saved-revision");
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
  await canvas.getByRole("combobox", {
    name: "Comparison measure for Effort by stage",
  }).selectOption("2");
  await expect(canvas.locator(".ic-chart > div strong")).toContainText(["3"]);
  await expect.poll(async () => (await (
    await page.request.get(`/api/tasks/${task.id}`)
  ).json() as Task).canvas?.chartAxes["chart"]).toBe(2);
  await evidence("04b-comparison-measure-changed");
  const spatialViews = canvas.getByRole("group", { name: "Geographic result view" });
  await spatialViews.getByRole("button", { name: "List" }).click();
  await expect(canvas.locator(".ic-map-stage")).toBeHidden();
  await expect(canvas.getByRole("group", { name: "Choose a place" })).toBeVisible();
  await spatialViews.getByRole("button", { name: "Map" }).click();
  await canvas.getByRole("button", { name: "Explore in 3D" }).click();
  await expect(page.locator("[data-google-map-test-double]")).toBeVisible();
  // This click invokes the actual gmp-click listener on the test-double
  // marker; the selection itself goes through the live task mutation API.
  await page.locator("igor-marker-mock").filter({
    hasText: "Supplied venue 2",
  }).click();
  await expect(
    canvas.locator(".ic-place-card").filter({hasText: "Supplied venue 2"}),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(canvas.getByLabel("Selected place detail")).toContainText("Supplied venue 2");
  await expect
    .poll(() => page.locator("[data-google-map-test-double]").evaluate(
      (el) => String((el as unknown as {center: {lat: number}}).center.lat),
    ))
    .toBe(String(40.732));
  await evidence("05-marker-detail-synced");
  await canvas
    .getByRole("button", { name: "Add to your plan", exact: true })
    .click();
  await expect(canvas.locator(".ic-map-plan")).toContainText(
    "Supplied venue 2",
  );
  await evidence("08-itinerary-added");
  await canvas.locator(".ic-place-card").filter({hasText: "Supplied venue 1"}).click();
  await canvas.getByRole("button", {name: "Add to your plan", exact: true}).click();
  await canvas.getByRole("button", {name: "Move Supplied venue 1 earlier"}).click();
  await expect(canvas.locator(".ic-map-plan li").first()).toContainText("Supplied venue 1");
  await evidence("09-itinerary-reordered");
  await canvas.getByRole("button", {name: "Remove Supplied venue 1"}).click();
  await expect(canvas.locator(".ic-map-plan li")).toHaveCount(1);
  // Force a provider failure and verify that the selected place and itinerary
  // remain usable as the user changes to the 2D provider adapter.
  await page.locator("[data-google-map-test-double]").evaluate(
    (el) => el.dispatchEvent(new Event("gmp-error")),
  );
  await canvas.getByRole("button", {name: "Use 2D map"}).click();
  await expect(canvas.locator("[data-google-2d-test-double]")).toBeVisible();
  await evidence("10-2d-fallback");
  const saved = (await (
    await page.request.get(`/api/tasks/${task.id}`)
  ).json()) as Task;
  expect(saved.canvas?.itineraryIds).toEqual(["venue-two"]);
  expect(saved.canvas?.chartAxes["chart"]).toBe(2);
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
  const measurements = await page.evaluate(() => {
    const composer = document.querySelector(".ip-conversation-composer");
    const rect = composer?.getBoundingClientRect();
    const metrics = (window as Window & {
      __igorInteractionMetrics?: {
        layoutShift: number; longTasks: number; longestTaskMs: number;
      };
    }).__igorInteractionMetrics;
    return {
      viewport: {width: innerWidth, height: innerHeight},
      scrollWidth: document.documentElement.scrollWidth,
      composerVisible: rect ? rect.top >= 0 &&
        rect.bottom <= (window.visualViewport?.height ?? innerHeight) + 1 : false,
      ...metrics,
    };
  });
  mkdirSync("test-results/canvas/metrics", {recursive: true});
  writeFileSync(
    `test-results/canvas/metrics/${info.project.name}.json`,
    JSON.stringify(measurements, null, 2),
  );
  expect(measurements.scrollWidth).toBeLessThanOrEqual(
    measurements.viewport.width + 1,
  );
  expect(measurements.composerVisible).toBe(true);
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
  // Coordinates are not mandatory for editing a current place. Removing them
  // only removes map capability, not the saved list, selection or itinerary.
  const withoutGeo = (await (
    await page.request.get(`/api/tasks/${task.id}`)
  ).json()) as Task;
  for (const candidate of withoutGeo.candidates) {
    if (candidate.type === "place" && candidate.place) {
      candidate.place.latitude = null;
      candidate.place.longitude = null;
    }
  }
  const missingGeoDb = new DatabaseSync(".igor/canvas-e2e/tasks.sqlite");
  missingGeoDb.prepare("UPDATE tasks SET state=? WHERE id=?").run(
    JSON.stringify(withoutGeo),
    task.id,
  );
  missingGeoDb.close();
  await page.reload();
  await expect(canvas.getByText(/No current coordinates are available/)).toBeVisible();
  const views = canvas.getByRole("group", {name: "Geographic result view"});
  await expect(views.getByRole("button", {name: "Map"})).toBeDisabled();
  await expect(canvas.getByRole("group", {name: "Choose a place"})).toBeVisible();
  await canvas.locator(".ic-place-card").filter({hasText: "Supplied venue 1"}).click();
  await expect.poll(async () => (await (
    await page.request.get(`/api/tasks/${task.id}`)
  ).json() as Task).canvas?.selectedCandidateId).toBe("venue-one");
  await expect(canvas.locator(".ic-map-plan")).toContainText("Supplied venue 2");
  await evidence("11-unmapped-place-list");
  expect(errors).toEqual([]);
});
