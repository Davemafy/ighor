import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { sampleCatalogue } from "../../src/data/fixtures";
import {
  installPresentation,
  PresentationSchema,
} from "../../src/core/presentation";
import type { Task } from "../../src/core/contracts";

for (const mobile of [false, true]) {
  test(`persistent candidate inspection ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const created = await page.request.post("/api/tasks", {
      headers: { Origin: "http://127.0.0.1:3560" },
    });
    expect(created.ok()).toBe(true);
    const task = (await created.json()) as Task;
    task.status = "ready";
    task.messages = [
      {
        role: "user",
        text: "Explore these recorded sample films",
        at: new Date().toISOString(),
      },
      {
        role: "assistant",
        kind: "conversation",
        text: "Sample fixture: select, compare and save these references. No live Qloo call.",
        at: new Date().toISOString(),
      },
    ];
    task.candidates = sampleCatalogue()
      .slice(0, 3)
      .map((c) => ({
        ...c,
        eligibility: "eligible",
        dependencies: [],
        freshness: "current",
        missing: [],
        violations: [],
        evidenceIds: [],
        fit: {},
        fitReason: "SAMPLE — illustrative test only",
      }));
    task.canvas = installPresentation(
      undefined,
      PresentationSchema.parse({
        id: "connected-discovery",
        title: "Sample cultural references",
        basis: "draft",
        root: "choices",
        nodes: [
          {
            id: "choices",
            type: "discovery",
            title: "References",
            candidateIds: task.candidates.map((c) => c.id),
          },
        ],
      }),
    );
    const db = new DatabaseSync(".igor/integration-browser/tasks.sqlite");
    db.prepare("UPDATE tasks SET state=? WHERE id=?").run(
      JSON.stringify(task),
      task.id,
    );
    db.close();
    await page.addInitScript(
      (id) => localStorage.setItem("igor-task", id),
      task.id,
    );
    await page.goto("/app");

    if (mobile) {
      const work = page.getByRole("button", { name: "Your work", exact: true });
      await expect(work).toBeVisible();
      await work.click();
    }

    const card = page.locator('[data-candidate-id="moonrise"]');
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Read details" }).click();
    const detail = page.getByRole("region", {
      name: "Details for Moonrise Kingdom",
    });
    await expect(detail).toBeFocused();
    await expect(
      detail.locator('[data-candidate-id="moonrise"]'),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("detail.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Read details" }).first(),
    ).toBeFocused();
    await card.getByRole("button", { name: "Choose", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "Selected", exact: true }),
    ).toBeVisible();
    await page.reload();

    if (mobile) {
      await page
        .getByRole("button", { name: "Your work", exact: true })
        .click();
    }

    await expect(
      page
        .locator('[data-candidate-id="moonrise"]')
        .getByRole("button", { name: "Selected", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator('[data-candidate-id="moonrise"]')
      .getByRole("button", { name: "Compare", exact: true })
      .click();
    await page
      .locator('[data-candidate-id="arrival"]')
      .getByRole("button", { name: "Compare", exact: true })
      .click();
    await page
      .locator(".iw-liquid-toolbar")
      .getByRole("button", { name: /Compare/ })
      .click();
    await expect(
      page.locator(".iw-liquid-compare-grid [data-candidate-id]"),
    ).toHaveCount(2);
    await page.screenshot({
      path: info.outputPath("comparison.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    await page.screenshot({
      path: info.outputPath("saved-reloaded.png"),
      fullPage: true,
    });
  });
}
