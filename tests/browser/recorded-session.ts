import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { Task } from "../../src/core/contracts";

export function requireOriginalArchive() {
  // Fail explicitly, never skip or silently replace provider recordings.
  const bytes = readFileSync("tests/fixtures/qloo-cultural.json.gz");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "3aedaf3dc10952f9a3a0ffe8b46d329bcb1ce453bbc6aa11cdd636ae6148904e",
  );
  expect(createHash("sha256").update(gunzipSync(bytes)).digest("hex")).toBe(
    "7fc699b2f275676795a7aff42bd35455126cfeb904382ee6c89d1997e6e97bd0",
  );
}

export async function recordedTurn(
  page: Page,
  task: Task,
  action: Record<string, unknown>,
): Promise<Task> {
  requireOriginalArchive();
  const response = await page.request.post(`/api/tasks/${task.id}/turn`, {
    data: { ...action, version: task.brief.version },
  });
  expect(response.ok()).toBe(true);
  const events = (await response.text())
    .split("\n\n")
    .filter((s) => s.startsWith("data: "))
    .map((s) => JSON.parse(s.slice(6)));
  expect(
    events.filter((e) => e.type === "error"),
    "Recorded task turn must complete without provider/configuration errors",
  ).toEqual([]);

  return events.findLast((e) => e.type === "done").task;
}

export async function startRecorded(
  page: Page,
  action: Record<string, unknown>,
): Promise<Task> {
  requireOriginalArchive();
  let task = (await (await page.request.post("/api/tasks")).json()) as Task;
  task = await recordedTurn(page, task, action);
  await page.addInitScript(
    (id) => localStorage.setItem("igor-task", id),
    task.id,
  );
  await page.goto("/app");

  return task;
}

export async function currentTask(page: Page): Promise<Task> {
  const id = await page.evaluate(() => localStorage.getItem("igor-task"));

  return (await page.request.get(`/api/tasks/${id}`)).json();
}

export async function keyboardMessage(page: Page, text: string): Promise<Task> {
  const before = await currentTask(page);
  const input = page.getByRole("textbox", {
    name: "Message Igor",
    exact: true,
  });
  await expect(input).toBeEnabled();
  await input.fill(text);
  await input.press("Enter");
  await expect
    .poll(async () => {
      const next = await currentTask(page);

      return (
        next.brief.version > before.brief.version && next.status !== "running"
      );
    })
    .toBe(true);
  await expect(page.locator(".iw-composer")).toHaveAttribute(
    "data-busy",
    "false",
  );

  return currentTask(page);
}
