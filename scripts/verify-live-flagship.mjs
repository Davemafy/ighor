import { chromium } from "playwright";
import fs from "node:fs/promises";
const root = "http://127.0.0.1:3570";
await fs.mkdir("test-results/live-flagship", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: "test-results/live-flagship",
    size: { width: 1440, height: 900 },
  },
});
const page = await context.newPage();
let report = {
  provenance: "LIVE attempt; never sample/recorded",
  passed: false,
};

try {
  const created = await page.request.post(root + "/api/tasks", {
    headers: { Origin: root },
  });

  if (!created.ok()) {
    throw Error("task_creation");
  }

  let task = await created.json();
  await page.addInitScript(
    (id) => localStorage.setItem("igor-task", id),
    task.id,
  );
  await page.goto(root + "/app");

  async function turn(text) {
    const response = await page.request.post(
      root + `/api/tasks/${task.id}/turn`,
      {
        headers: { Origin: root },
        data: {
          ...(typeof text === "string" ? { type: "message", text } : text),
          version: task.brief.version,
        },
        timeout: 600000,
      },
    );

    if (!response.ok()) {
      throw Error("turn_http_" + response.status());
    }

    const events = (await response.text())
      .split("\n\n")
      .filter((s) => s.startsWith("data: "))
      .map((s) => JSON.parse(s.slice(6)));
    const done = events.findLast((e) => e.type === "done");

    if (!done) {
      throw Error("turn_incomplete");
    }

    task = done.task;
    await page.reload();
    await page.locator(".iw-composer").waitFor();
    await page.waitForTimeout(700);

    return structuredClone(task);
  }

  let first = await turn(
    "Create and save a practical proposal for an unexpected Brooklyn community experience inspired by Sade, Radiohead and Wong Kar-wai. Keep the total budget within $3,000. Include a defensible cultural direction, provisional schedule and budget, and a partner pitch. Use cultural discovery to inform the actual choices; label unverified practical facts.",
  );
  await page.screenshot({
    path: "test-results/live-flagship/01-proposal.png",
    fullPage: true,
  });
  // A real owner-authored independent constraint, explicitly saved and approved.
  // This is not model output or Qloo evidence.
  await turn({
    type: "work",
    actions: [
      {
        kind: "goal",
        id: "flagship-access",
        title: "Independent access requirement",
      },
      {
        kind: "document",
        id: "access-principle",
        title: "Access principle",
        content:
          "Owner requirement: keep step-free access as a venue-selection constraint. Verify accessibility with any proposed partner before committing.",
        dependencies: [],
        evidenceIds: [],
      },
    ],
  });
  first = await turn({
    type: "work",
    actions: [{ kind: "approve", id: "access-principle" }],
  });
  const second = await turn(
    "Replace Radiohead with Bad Bunny. Keep the $3,000 budget, Sade and Wong Kar-wai, and preserve approved independent work. Revise only dependent decisions and save the revised proposal.",
  );
  await page.screenshot({
    path: "test-results/live-flagship/02-revision.png",
    fullPage: true,
  });
  await page.reload();
  const loaded = await (
    await page.request.get(root + `/api/tasks/${task.id}`)
  ).json();
  const cultural = (t) => t.evidence.filter((e) => e.kind === "cultural");
  const newEvidence = cultural(second).filter(
    (e) => !cultural(first).some((old) => old.id === e.id),
  );
  const approved = (first.work?.documents ?? []).filter(
    (a) => a.status === "approved",
  );
  const approvedPreserved = approved.every((a) =>
    (loaded.work?.documents ?? []).some(
      (b) =>
        b.id === a.id && b.content === a.content && b.status === "approved",
    ),
  );
  report = {
    ...report,
    firstStatus: first.agentRun?.status ?? first.status,
    firstRun: first.agentRun
      ? {
          warnings: first.agentRun.warnings,
          usage: first.agentRun.usage,
          steps: first.agentRun.steps.map(
            ({ tool, status, requests, summary }) => ({
              tool,
              status,
              requests,
              summary: summary.slice(0, 180),
            }),
          ),
          acceptance: first.agentRun.acceptance?.status,
        }
      : null,
    revisionRun: second.agentRun
      ? {
          warnings: second.agentRun.warnings,
          usage: second.agentRun.usage,
          steps: second.agentRun.steps.map(
            ({ tool, status, requests, summary }) => ({
              tool,
              status,
              requests,
              summary: summary.slice(0, 180),
            }),
          ),
          acceptance: second.agentRun.acceptance?.status,
        }
      : null,
    diagnostics: second.trace
      .filter((t) => /error|recovered|rejected/.test(t.action))
      .map((t) => ({
        action: t.action,
        category: /^agent\.(decision|requirements)\.error$/.test(t.action)
          ? t.outcome
          : t.outcome
              .match(/Diagnostic: ([^.]+)|failed \(([^)]+)\)/)
              ?.slice(1)
              .filter(Boolean)
              .join(";") || "unclassified",
      })),
    revisionStatus: second.agentRun?.status ?? second.status,
    firstCulturalEvidence: cultural(first).length,
    newCulturalEvidence: newEvidence.length,
    firstArtifacts: first.artifacts.length,
    revisionArtifacts: second.artifacts.length,
    budgetRetained: loaded.brief.constraints.budget === 3000,
    reloadStable:
      JSON.stringify(loaded.artifacts) === JSON.stringify(second.artifacts),
    approvedCount: approved.length,
    approvedPreserved,
  };
  const compared = await turn({ type: "baseline" });
  report.samePoolEvaluation = compared.evaluation ?? null;
  report.passed =
    first.agentRun?.acceptance?.status === "satisfied" &&
    second.agentRun?.acceptance?.status === "satisfied" &&
    newEvidence.length > 0 &&
    report.budgetRetained &&
    report.reloadStable &&
    approved.length > 0 &&
    approvedPreserved;
} catch (error) {
  report.failure = String(error.message)
    .replace(/[^a-zA-Z0-9_ -]/g, "")
    .slice(0, 100);
} finally {
  await fs.writeFile(
    "test-results/live-flagship/report.json",
    JSON.stringify(report, null, 2),
  );
  console.log("LIVE_FLAGSHIP_REPORT", JSON.stringify(report));
  await context.close();
  await browser.close();
}

if (!report.passed) {
  process.exitCode = 1;
}
