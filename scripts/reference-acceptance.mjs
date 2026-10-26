// Production HTTP acceptance for bounded reference goals. No live credentials needed.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.IGOR_ACCEPTANCE_URL ?? "http://127.0.0.1:3300";

if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
  throw new Error("Acceptance runner supports local HTTP only.");
}

const results = [];

for (const [kind, goal, artifactKind] of [
  [
    "discovery",
    "Discover films and music, budget $60 and 180 minutes.",
    "comparison",
  ],
  [
    "creative",
    "Create a creative brief, budget $60 and 180 minutes.",
    "creative-brief",
  ],
]) {
  const start = await fetch(base + "/api/tasks", {
    method: "POST",
    headers: { Origin: base },
  });
  assert.equal(start.status, 200);
  const cookie = start.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  let task = await start.json();
  assert.equal(
    task.modelMode,
    "scripted",
    "Recorded acceptance must not spend model credits.",
  );
  const snapshots = [];

  async function message(text) {
    const response = await fetch(`${base}/api/tasks/${task.id}/turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        Cookie: cookie,
      },
      body: JSON.stringify({
        type: "message",
        text,
        version: task.brief.version,
      }),
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
    task = events.find((e) => e.type === "done")?.task;
    assert.ok(task);
    snapshots.push({ text, task: structuredClone(task) });
  }

  await message(goal);
  assert.equal(task.status, "clarification");
  await message("Use Moonlight from 2016.");
  assert.equal(task.candidates.length, 30);
  assert.equal(task.brief.selected.length, 0);
  assert.ok(task.candidates.every((c) => c.eligibility === "needs-review"));
  // Synthetic operator assumptions, not current prices, full runtimes or verified access.
  await message(
    "For Children of Men: cost $5, duration 80 minutes, access confirmed.",
  );
  await message(
    "For Thom Yorke: cost $5, duration 15 minutes, access confirmed.",
  );
  assert.equal(task.brief.kind, kind);
  assert.equal(task.status, "ready");
  assert.equal(task.artifacts.find((a) => a.id === "main")?.kind, artifactKind);
  assert.deepEqual(task.schedule, []);
  assert.equal(task.brief.selected.length, 2);
  await message("Edit main: An editable reference direction for review.");
  assert.equal(
    task.artifacts.find((a) => a.id === "main")?.content,
    "An editable reference direction for review.",
  );
  assert.equal(task.receipts.at(-1).culturalRequests, 0);
  await message("Budget $1");
  assert.equal(task.brief.selected.length, 0);
  assert.equal(task.receipts.at(-1).culturalRequests, 0);
  await message("Budget $60");
  assert.equal(task.brief.selected.length, 2);
  await message("Move it to Different screening room.");
  assert.equal(task.brief.selected.length, 0);
  assert.ok(task.candidates.every((c) => c.eligibility === "needs-review"));
  assert.ok(
    task.receipts.every(
      (r) => r.culturalRequests === 0 && r.modelRequests === 0,
    ),
  );
  results.push({ kind, status: "passed", turns: snapshots.length, snapshots });
}

await mkdir("artifacts", { recursive: true });

await writeFile(
  "artifacts/reference-http-acceptance.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      status: "passed",
      interpretation: "deterministic development provider",
      cultural_data:
        "genuine archived Qloo responses, CACHED; zero external requests",
      practical_facts:
        "explicit synthetic operator assumptions, not independently verified",
      results,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  "Reference HTTP acceptance passed: discovery and creative, 16 turns, zero external calls.",
);
