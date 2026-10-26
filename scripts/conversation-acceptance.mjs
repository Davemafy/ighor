// Run against a local Igor server configured with IGOR_QLOO_RECORDING.
// Explicit operator planning assumptions below are not independently verified facts.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.IGOR_ACCEPTANCE_URL ?? "http://127.0.0.1:3300";

if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
  throw new Error("Acceptance runner supports local HTTP only.");
}

const response = await fetch(base + "/api/tasks", {
  method: "POST",
  headers: { Origin: base },
});

assert.equal(response.status, 200);

const cookie = response.headers.get("set-cookie")?.split(";")[0];

assert.ok(cookie);

let task = await response.json();

assert.equal(
  task.modelMode,
  "scripted",
  "Run this recorded-data acceptance with live model credentials unset.",
);

const snapshots = [];

async function turn(input, label) {
  const response = await fetch(`${base}/api/tasks/${task.id}/turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Cookie: cookie,
    },
    body: JSON.stringify({ ...input, version: task.brief.version }),
  });
  assert.equal(response.status, 200);
  const events = (await response.text())
    .split("\n\n")
    .filter((s) => s.startsWith("data: "))
    .map((s) => JSON.parse(s.slice(6)));
  assert.equal(
    events.some((e) => e.type === "error"),
    false,
  );
  const done = events.find((e) => e.type === "done");
  assert.ok(done?.task);
  task = done.task;
  snapshots.push({
    label,
    task,
    staleAtStart: events
      .filter((e) => e.type === "state")
      .map((e) =>
        e.task.artifacts
          .filter((a) => a.freshness === "stale")
          .map((a) => a.id),
      ),
  });
}

async function say(text, label = text) {
  await turn({ type: "message", text }, label);
}

await say("Plan a gathering for six friends, budget $60 and 180 minutes.");

assert.equal(task.status, "clarification");

await say("Use Moonlight from 2016.");

assert.equal(task.status, "partial");

assert.equal(
  task.candidates.every((c) => c.eligibility === "needs-review"),
  true,
);

await say(
  "For Children of Men: cost $5, duration 80 minutes, access confirmed.",
);

await say("For Thom Yorke: cost $5, duration 15 minutes, access confirmed.");

assert.equal(task.status, "ready");

assert.equal(
  task.schedule.reduce((n, s) => n + s.minutes, 0),
  135,
);

await say("Choose Children of Men and Thom Yorke.");

const discoveries = task.trace.filter(
  (t) => t.action === "cultural.discover",
).length;

await say("Invitation: Bring your curiosity.");

assert.equal(
  task.trace.filter((t) => t.action === "cultural.discover").length,
  discoveries,
);

assert.equal(
  task.artifacts.find((a) => a.id === "invitation").content,
  "Bring your curiosity.",
);

await say("Lower budget to $1");

assert.deepEqual(task.brief.selected, []);

assert.equal(task.receipts.at(-1).culturalRequests, 0);

assert.equal(task.receipts.at(-1).status, "partial");

await say("Budget $60");

await say("Let Igor choose.");

await say("Replace Amara's Radiohead with Kendrick Lamar.");

const amara = task.brief.participants.find((p) => p.id === "amara");

assert.equal(
  amara.preferences.find((p) => p.value === "Radiohead").polarity,
  "unknown",
);

assert.equal(
  amara.preferences.find((p) => p.value === "Kendrick Lamar").polarity,
  "like",
);

await say(
  "For BlacKkKlansman: cost $5, duration 80 minutes, access confirmed.",
);

await say(
  "For Tyler, the Creator: cost $5, duration 15 minutes, access confirmed.",
);

assert.equal(task.status, "ready");

assert.ok(task.brief.selected.length > 0);

await say("Move it to Different screening room.");

assert.deepEqual(task.brief.selected, []);

assert.equal(task.status, "partial");

await say("Alex likes Radiohead.");

assert.equal(task.status, "clarification");

assert.ok(task.brief.unresolved.join(" ").includes("Alex"));

assert.equal(task.receipts.length, snapshots.length);

assert.equal(
  task.receipts.every((r) => r.modelRequests === 0 && r.culturalRequests === 0),
  true,
);

await mkdir("artifacts", { recursive: true });

await writeFile(
  "artifacts/conversation-http-acceptance.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      status: "passed",
      turns: snapshots.length,
      scope:
        "Actual production HTTP application, deterministic command interpretation, genuine archived Qloo responses. No live API calls or fabricated current facts.",
      practicalFacts:
        "Explicit synthetic operator assumptions: $5 and 80-minute viewing or 15-minute music segment; not independently verified runtimes/prices/access.",
      snapshots,
    },
    null,
    2,
  ),
);

console.log(
  `PASS: ${snapshots.length} conversational HTTP turns, conditional programmes, revisions, clarifications and saved receipts.`,
);
