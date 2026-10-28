import { test, expect } from "@playwright/test";
import {
  startRecorded,
  recordedTurn,
  currentTask,
  keyboardMessage,
} from "./recorded-session";

// /workspace redirects to /app. Set up the same owner-scoped recorded actions
// the retired starter buttons dispatched; all correction turns use the real UI.
test("conversation → itinerary → supplied facts → keyboard revision → persisted structured export", async ({
  page,
}) => {
  let task = await startRecorded(page, {
    type: "place-example",
    city: "Tokyo",
  });
  task = await keyboardMessage(page, "Build a 3-day itinerary in Tokyo.");
  expect(task.artifacts[0].details?.kind).toBe("itinerary");

  for (const c of task.candidates.slice(0, 3)) {
    task = await keyboardMessage(
      page,
      `For ${c.name}: cost $5, duration 20 minutes, access confirmed.`,
    );
  }

  task = await keyboardMessage(page, "Transfer allowance: 10 minutes.");
  expect(task.artifacts[0].details?.status).toBe(
    "feasible-from-supplied-facts",
  );
  expect(
    task.artifacts[0].details?.segments.some((segment) => segment.day === 2),
  ).toBe(true);
  const requests = task.trace.filter(
    (e) => e.action === "cultural.discover",
  ).length;
  task = await keyboardMessage(page, "Budget $4.");
  expect(task.brief.selected).toEqual([]);
  expect(
    task.trace.filter((e) => e.action === "cultural.discover"),
  ).toHaveLength(requests);
  const response = await page.request.get(
    `/api/tasks/${task.id}/export?format=json&artifacts=main`,
  );
  expect(response.status()).toBe(200);
  const snapshot = await response.json();
  expect(snapshot.artifacts[0].details.kind).toBe("itinerary");
  expect(snapshot.artifacts[0].details.segments).toEqual([]);
  await page.reload();
  expect((await currentTask(page)).artifacts).toEqual(task.artifacts);
  await expect(
    page
      .getByRole("heading", { name: task.artifacts[0].title, exact: true })
      .first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("personal taste → listening programme → transitions → editable source", async ({
  page,
}) => {
  let task = await startRecorded(page, {
    type: "personal-profile",
    name: "You",
    artist: "Radiohead",
  });
  expect(task.candidates).toHaveLength(30);
  expect(task.preferences).toEqual([]);
  task = await keyboardMessage(
    page,
    "Build a playlist with 120 minutes and budget $20.",
  );
  expect(task.artifacts[0].details?.kind).toBe("listening");

  for (const c of task.candidates.slice(0, 2)) {
    task = await keyboardMessage(
      page,
      `For ${c.name}: cost $5, duration 30 minutes, access confirmed.`,
    );
  }

  task = await keyboardMessage(page, "Transition allowance: 5 minutes.");
  expect(task.artifacts[0].details?.totalMinutes).toBe(65);
  expect(task.brief.constraints.duration).toBe(120);
  const wording =
    "A quiet opening, followed by a discussion. Owner-authored direction.";
  task = await keyboardMessage(
    page,
    `Edit ${task.artifacts[0].id}: ${wording}`,
  );
  expect(task.artifacts[0].content).toBe(wording);
  await expect(page.getByText(wording, { exact: true }).first()).toBeVisible();
  await page.reload();
  expect((await currentTask(page)).artifacts[0].content).toBe(wording);
});

test("research report exposes cited claims, unknowns and exportable references", async ({
  page,
}) => {
  await startRecorded(page, { type: "place-example", city: "Tokyo" });
  const task = await keyboardMessage(
    page,
    "Create a cultural research report.",
  );
  expect(task.brief.selected).toEqual([]);
  expect(task.artifacts[0].details?.references).toHaveLength(10);
  expect(
    task.artifacts[0].details?.claims?.some(
      (claim) => claim.basis === "retrieved-association",
    ),
  ).toBe(true);
  expect(task.artifacts[0].details?.openQuestions.length).toBeGreaterThan(0);
  expect(task.artifacts[0].evidenceIds.length).toBeGreaterThan(0);
  await expect(
    page
      .getByRole("heading", { name: task.artifacts[0].title, exact: true })
      .first(),
  ).toBeVisible();
  const response = await page.request.get(
    `/api/tasks/${task.id}/export?format=json&artifacts=${task.artifacts[0].id}`,
  );
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-disposition"]).toContain(".json");
  const snapshot = await response.json();
  expect(snapshot.artifacts[0].details.references).toHaveLength(10);
  expect(snapshot.artifacts[0].evidenceIds).toEqual(
    task.artifacts[0].evidenceIds,
  );
});

test("place → artist context → music direction preserves the real anchor and exposes rights uncertainty", async ({
  page,
}) => {
  let task = await startRecorded(page, {
    type: "place-example",
    city: "Tokyo",
  });
  const museum = task.candidates.find((c) => c.name === "Ghibli Museum")!;
  task = await recordedTurn(page, task, {
    type: "connection",
    candidateId: museum.id,
    targetType: "artist",
  });
  await page.reload();
  task = await keyboardMessage(
    page,
    "Develop a music direction from these artists.",
  );
  expect(task.brief.contextAnchor?.name).toBe("Ghibli Museum");
  expect(task.artifacts[0].details?.kind).toBe("music-direction");
  expect(task.artifacts[0].content).toContain("commercial playback rights");
  await expect(
    page
      .getByRole("heading", { name: task.artifacts[0].title, exact: true })
      .first(),
  ).toBeVisible();
});
