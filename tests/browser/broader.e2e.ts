import { test, expect, type Page } from "@playwright/test";
import type { Task } from "../../src/core/contracts";

async function current(page: Page) {
  const id = await page.evaluate(() => localStorage.getItem("igor-task"));

  return (await (await page.request.get(`/api/tasks/${id}`)).json()) as Task;
}

async function message(page: Page, text: string) {
  const before = (await current(page)).brief.version;
  const input = page.getByLabel("Tell Igor your goal or correction");
  await input.fill(text);
  await input.press("Enter");
  await expect
    .poll(async () => {
      const t = await current(page);

      return t.brief.version > before && t.status !== "running";
    })
    .toBe(true);
  await expect(page.getByLabel("Send message")).toBeDisabled();

  return current(page);
}

async function tokyo(page: Page) {
  await page.goto("/workspace");
  await page.getByRole("button", { name: /Tokyo/ }).click();
  await expect(
    page.getByRole("tab", { name: "Options · 10", exact: true }),
  ).toBeVisible();
}

test("conversation → itinerary → supplied facts → keyboard revision → persisted structured export", async ({
  page,
}) => {
  await tokyo(page);
  let t = await message(page, "Build a 3-day itinerary in Tokyo.");
  await expect(
    page.getByRole("heading", {
      name: "A cultural journey, with the gaps visible",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Structured outcome")).toContainText(
    "No confirmed schedule",
  );

  for (const c of t.candidates.slice(0, 3)) {
    t = await message(
      page,
      `For ${c.name}: cost $5, duration 20 minutes, access confirmed.`,
    );
  }

  await page.getByText("Adjust the journey", { exact: true }).click();
  await page.getByLabel("Transition allowance", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Recalculate programme", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Structured outcome")).toContainText(
    "feasible from supplied facts",
  );
  await expect(
    page.getByRole("region", { name: "Day 2", exact: true }),
  ).toBeVisible();
  const before = await current(page);
  const requests = before.trace.filter(
    (e) => e.action === "cultural.discover",
  ).length;
  t = await message(page, "Budget $4.");
  expect(t.brief.selected).toEqual([]);
  expect(t.trace.filter((e) => e.action === "cultural.discover")).toHaveLength(
    requests,
  );
  await expect(page.getByLabel("Structured outcome")).toContainText(
    "No confirmed schedule",
  );
  const response = await page.request.get(
    `/api/tasks/${t.id}/export?format=json&artifacts=main`,
  );
  expect(response.status()).toBe(200);
  const snapshot = await response.json();
  expect(snapshot.artifacts[0].details.kind).toBe("itinerary");
  expect(snapshot.artifacts[0].details.segments).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "A cultural journey, with the gaps visible",
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("personal taste → listening programme → transitions → editable source", async ({
  page,
}) => {
  await page.goto("/workspace");
  await page.getByText("Start from your own taste", { exact: true }).click();
  await page
    .getByLabel("An artist you love", { exact: true })
    .fill("Radiohead");
  await page
    .getByRole("button", { name: "Explore from my taste", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Options · 30", exact: true }),
  ).toBeVisible();
  let t = await message(
    page,
    "Build a playlist with 120 minutes and budget $20.",
  );
  await expect(
    page.getByRole("heading", {
      name: "A listening programme to refine",
      exact: true,
    }),
  ).toBeVisible();

  for (const c of t.candidates.slice(0, 2)) {
    t = await message(
      page,
      `For ${c.name}: cost $5, duration 30 minutes, access confirmed.`,
    );
  }

  await message(page, "Transition allowance: 5 minutes.");
  await expect(page.getByLabel("Structured outcome")).toContainText(
    "65 / 120 total minutes",
  );
  await page.getByText("Edit the working document", { exact: true }).click();
  await page
    .getByLabel("Edit listening-plan", { exact: true })
    .fill(
      "A quiet opening, followed by a discussion. Owner-authored direction.",
    );
  await page
    .getByRole("button", { name: /Save.*edit|Save draft|Save changes/i })
    .click();
  await expect(
    page
      .getByText(
        "A quiet opening, followed by a discussion. Owner-authored direction.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
});

test("research report exposes cited claims, unknowns and exportable references", async ({
  page,
}) => {
  await tokyo(page);
  const t = await message(page, "Create a cultural research report.");
  await expect(
    page.getByRole("heading", {
      name: "What the cultural evidence supports",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByText("Inspect the claim ledger · 10 claims", { exact: true })
    .click();
  await expect(page.getByLabel("Structured outcome")).toContainText(
    "retrieved association",
  );
  expect(t.brief.selected).toEqual([]);
  expect(t.artifacts[0].details?.references).toHaveLength(10);
  await page.getByRole("tab", { name: "Keep & share", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /JSON/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
});

test("place → artist context → music direction preserves the real anchor and exposes rights uncertainty", async ({
  page,
}) => {
  await tokyo(page);
  await page.getByRole("tab", { name: "Connections", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Explore artists connected to this place",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Context: Ghibli Museum", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Creative brief", exact: true }).click();
  await message(page, "Develop a music direction from these artists.");
  await expect(
    page.getByRole("heading", {
      name: "A music direction, grounded in references",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Structured outcome")).toContainText(
    "commercial playback rights",
  );
  expect((await current(page)).brief.contextAnchor?.name).toBe("Ghibli Museum");
});
