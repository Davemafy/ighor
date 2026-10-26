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

await turn({ type: "sample" }, "Consequence-bearing identity clarification");

assert.equal(task.status, "clarification");

const moonlight = task.entities.find((e) => e.original === "Moonlight");

assert.equal(moonlight.status, "ambiguous");

await turn(
  {
    type: "resolve",
    entityId: moonlight.id,
    choiceId: "2955F3C4-36AB-49F3-A818-3597F35EF46C",
  },
  "Explicit synthetic-profile choice: 2016 film",
);

assert.equal(task.status, "partial");

assert.equal(
  task.candidates.every((c) => c.eligibility === "needs-review"),
  true,
);

assert.equal(
  new Set(task.candidates.flatMap((c) => Object.keys(c.cultural ?? {}))).size,
  6,
);

const options = task.catalogue.map((c) => ({
  ...c,
  cost: {
    ...c.cost,
    value: 5,
    reference: "Operator-supplied test assumption, not a verified market price",
  },
  duration: {
    ...c.duration,
    value: c.type === "artist" ? 15 : 80,
    reference: "Operator test segment length, not verified full film runtime",
  },
  available: true,
}));

await turn(
  { type: "catalogue", options },
  "Conditional programme from supplied planning facts",
);

assert.equal(task.status, "ready");

assert.equal(task.brief.selected.length, 2);

assert.ok(task.schedule.reduce((sum, s) => sum + s.minutes, 0) <= 180);

await turn(
  {
    type: "artifact",
    artifactId: "invitation",
    content:
      "Join us for a shared screening and listening session. Confirm access before committing.",
  },
  "Wording-only revision",
);

await turn(
  { type: "constraints", budget: 1 },
  "Budget makes previous selections infeasible",
);

assert.deepEqual(task.brief.selected, []);

await turn({ type: "constraints", budget: 60 }, "Restore budget");

const amara = structuredClone(task.brief.participants[0]);

amara.preferences[0].value = "Kendrick Lamar";

await turn(
  { type: "participant", participant: amara },
  "Taste revision uses recorded Kendrick queries",
);

assert.ok(
  task.candidates.some((c) =>
    c.cultural?.amara?.seedIds.includes("C915A918-39C5-47A3-A101-D9FA1DECBD9C"),
  ),
);

assert.equal(
  task.trace.reduce((sum, t) => sum + t.requests, 0),
  0,
);

assert.equal(
  task.evidence
    .filter((e) => e.kind === "cultural")
    .every((e) => e.delivery === "CACHED"),
  true,
);

const bad = await fetch(`${base}/api/tasks/${task.id}/turn`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie },
  body: JSON.stringify({ type: "constraints", budget: 100, version: 0 }),
});

assert.equal(bad.status, 409);

const unauthorized = await fetch(`${base}/api/tasks/${task.id}`);

assert.equal(unauthorized.status, 401);

await mkdir("artifacts", { recursive: true });

await writeFile(
  "artifacts/backend-http-acceptance.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      status: "passed",
      scope:
        "Actual local HTTP application flow using genuine archived Qloo responses and deterministic development interpretation. Not a live in-app Gemini test.",
      practicalFacts: "Explicit operator-supplied test assumptions only",
      staleVersionRejected: true,
      unauthenticatedReadRejected: true,
      requests: { qloo: 0, model: 0 },
      snapshots,
    },
    null,
    2,
  ),
);

console.log(
  "PASS: seven HTTP workflow turns, real recorded cultural evidence, revisions, ownership and stale-version rejection.",
);
