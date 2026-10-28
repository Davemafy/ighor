import { chromium } from "playwright";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

const root = (
  process.env.IGOR_BASE_URL || "http://127.0.0.1:3570"
).replace(/\/$/, "");
const alternative = (process.env.IGOR_UNSCRIPTED_PROMPT || "").trim();
const output = "test-results/live-alternatives";
await fs.mkdir(output, { recursive: true });
const report = {
  provenance: "LIVE runtime attempt, not a recorded fixture or model mock",
  baseUrl: root,
  cases: [],
  passed: false,
};

if (
  alternative.length < 12 ||
  /(?:Radiohead|Bad Bunny|Brooklyn)/i.test(alternative)
) {
  report.blocked =
    "Provide a distinct, owner-authored goal through IGOR_UNSCRIPTED_PROMPT (minimum 12 characters).";
  await fs.writeFile(output + "/report.json", JSON.stringify(report, null, 2));
  console.log("LIVE_ALTERNATIVE_REPORT", JSON.stringify(report));
  process.exit(2);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const cases = [
    {
      name: "ordinary-conversation",
      prompt: "Hello Igor. What can you help me with?",
    },
    { name: "owner-unscripted-alternative", prompt: alternative },
  ];

  for (const testCase of cases) {
    const result = {
      name: testCase.name,
      promptSha256: createHash("sha256").update(testCase.prompt).digest("hex"),
      passed: false,
    };
    report.cases.push(result);
    try {
      const created = await page.request.post(root + "/api/tasks", {
        headers: { Origin: root },
      });
      if (!created.ok()) throw Error("task_creation_http_" + created.status());
      let task = await created.json();
      const initialVersion = task.brief.version;
      const response = await page.request.post(
        root + "/api/tasks/" + encodeURIComponent(task.id) + "/turn",
        {
          headers: { Origin: root },
          data: {
            type: "message",
            text: testCase.prompt,
            version: initialVersion,
          },
          timeout: 600000,
        },
      );
      if (!response.ok()) throw Error("turn_http_" + response.status());
      const events = (await response.text())
        .split("\n\n")
        .filter((event) => event.startsWith("data: "))
        .map((event) => JSON.parse(event.slice(6)));
      const done = events.findLast((event) => event.type === "done");
      if (!done?.task) throw Error("turn_missing_done_event");
      task = done.task;

      const read = await page.request.get(
        root + "/api/tasks/" + encodeURIComponent(task.id),
      );
      if (!read.ok()) throw Error("reload_http_" + read.status());
      const persisted = await read.json();
      const replies = persisted.messages.filter((m) => m.role === "assistant");
      const latestReply = replies.at(-1)?.text ?? "";
      const genericFailure =
        /interpretation failed safely|couldn.t complete that reply|try again later/i.test(
          latestReply,
        );
      result.preservedAcrossReload =
        persisted.id === task.id &&
        persisted.brief.version === task.brief.version &&
        JSON.stringify(persisted.messages) === JSON.stringify(task.messages);
      result.agentStatus = persisted.agentRun?.status ?? null;
      result.artifactCount = persisted.artifacts?.length ?? 0;
      result.liveCulturalEvidenceCount =
        persisted.evidence?.filter(
          (item) => item.kind === "cultural" && item.delivery === "LIVE",
        ).length ?? 0;
      result.hasAssistantReply = latestReply.trim().length > 0;
      result.genericFailure = genericFailure;
      result.passed =
        result.preservedAcrossReload &&
        result.hasAssistantReply &&
        !genericFailure;

      await page.goto(root + "/app?task=" + encodeURIComponent(task.id));
      await page.locator(".iw-composer").waitFor({ timeout: 30000 });
      await page.screenshot({
        path: output + "/" + testCase.name + ".png",
        fullPage: true,
      });
    } catch (error) {
      result.failure =
        error instanceof Error ? error.message.slice(0, 150) : "unknown";
    }
  }

  report.passed = report.cases.every((item) => item.passed);
  await context.close();
} catch (error) {
  report.failure =
    error instanceof Error ? error.message.slice(0, 150) : "unknown";
} finally {
  await fs.writeFile(output + "/report.json", JSON.stringify(report, null, 2));
  console.log("LIVE_ALTERNATIVE_REPORT", JSON.stringify(report));
  if (browser) await browser.close();
}

if (!report.passed) process.exitCode = 1;
