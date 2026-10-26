import { test, expect, type Page } from "@playwright/test";
import type { Task } from "../../src/core/contracts";

async function saved(page: Page): Promise<Task> {
  return page.evaluate(async () => {
    const id = localStorage.getItem("igor-task");
    const response = await fetch(`/api/tasks/${id}`);

    if (!response.ok) {
      throw new Error("Saved workspace unavailable");
    }

    return response.json();
  });
}

async function message(page: Page, text: string) {
  const input = page.getByRole("textbox", {
    name: "Message Igor",
    exact: true,
  });
  await expect(input).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("igor-task")))
    .toBeTruthy();
  await expect(page.locator(".pp-compose")).toHaveAttribute(
    "data-busy",
    "false",
  );
  const previous = (await saved(page)).brief.version;
  await input.fill(text);
  await input.press("Enter");
  await expect
    .poll(async () => (await saved(page)).brief.version)
    .toBeGreaterThan(previous);
  await expect(input).toBeEnabled();
  await expect(page.locator(".pp-transcript")).toHaveAttribute(
    "aria-busy",
    "false",
  );

  return saved(page);
}

test("existing chat UI carries a listening-bar concept through approvals, edits, budget revision and reload (scripted fixtures)", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  await page.goto("/app");
  await expect(
    page.getByRole("textbox", { name: "Message Igor", exact: true }),
  ).toBeEnabled();
  await message(page, "hey");
  let task = await message(
    page,
    "I want to launch a small listening bar for people into alternative music and independent art. Help me make it distinctive without overspending.",
  );
  expect(task.work?.documents).toHaveLength(8);
  await expect(page.locator(".pp-message-assistant").last()).toContainText(
    "Audience and concept",
  );
  await message(page, "Budget: 1000");
  await message(page, "Approve Musical identity");
  await message(
    page,
    "Edit listening-bar-invite: Our exact invitation wording.",
  );
  const before = await saved(page);
  task = await message(
    page,
    "Cut the budget by 30%, keep the musical identity, and preserve everything I already approved.",
  );
  expect(task.work?.budget?.amount).toBe(700);
  expect(task.work?.budgetHistory.at(-1)?.amount).toBe(1000);
  expect(
    task.work?.decisions.find((d) => d.id === "listening-bar-identity")?.status,
  ).toBe("approved");
  expect(
    task.work?.documents.find((d) => d.id === "listening-bar-invite")?.content,
  ).toBe("Our exact invitation wording.");
  expect(
    task.work?.documents.find((d) => d.id === "listening-bar-concept"),
  ).toEqual(
    before.work?.documents.find((d) => d.id === "listening-bar-concept"),
  );
  expect(
    task.work?.documents.find((d) => d.id === "listening-bar-allocation")
      ?.history.length,
  ).toBeGreaterThan(0);
  expect(task.receipts!.every((r) => r.culturalRequests === 0)).toBe(true);
  await expect(page.locator(".pp-message-assistant").last()).toContainText(
    "$700",
  );
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Message Igor", exact: true }),
  ).toBeEnabled();
  expect((await saved(page)).work).toEqual(task.work);
  expect(runtimeErrors).toEqual([]);
});

test("technical recommendation changes audience without replacing its decision or unrelated documents (recorded development example)", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("textbox", { name: "Message Igor", exact: true }),
  ).toBeEnabled();
  await message(page, "I want to launch a small listening bar.");
  const unrelated = (await saved(page)).work!.documents;
  await message(
    page,
    "Research three frontend frameworks and prepare a technical recommendation for my team.",
  );
  await message(page, "Approve Framework recommendation");
  const before = (await saved(page)).work!.documents.find(
    (d) => d.id === "framework-report",
  )!;
  const task = await message(
    page,
    "Keep the recommendation, but change the audience to beginner developers and shorten the report.",
  );
  const report = task.work!.documents.find((d) => d.id === "framework-report")!;
  expect(report.id).toBe(before.id);
  expect(report.version).toBe(before.version + 1);
  expect(report.history.at(-1)?.content).toBe(before.content);
  expect(report.content).toContain("Recorded development fixture");
  expect(
    task.work?.decisions.find((d) => d.id === "framework-choice")?.status,
  ).toBe("approved");
  expect(
    task.work?.documents.filter((d) => d.goalId === "listening-bar"),
  ).toEqual(unrelated);
  expect(task.receipts!.every((r) => r.culturalRequests === 0)).toBe(true);
  await expect(page.locator(".pp-message-assistant").last()).toContainText(
    "shortened for beginners",
  );
});
