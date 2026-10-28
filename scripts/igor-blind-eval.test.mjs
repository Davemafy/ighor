import assert from "node:assert/strict";
import test from "node:test";
import { prepare, score } from "./igor-blind-eval.mjs";

const output =
  "An independent designer's book might connect these interests through visual mood, but availability is not verified.";
const other =
  "This design book may relate, but please confirm editions, delivery and whether the person likes it.";
const arm = (value, qloo) => ({
  output: value,
  model: "same-model",
  toolPolicy: qloo ? "search-plus-qloo" : "search",
  elapsedMs: 1000,
  sourceRefs: [],
  ...(qloo ? { qlooEvidenceRefs: ["actual-evidence-id"] } : {}),
});

function input() {
  return {
    studyId: "repeatable-study",
    runs: [
      {
        caseId: "D01",
        goal: "Find an unexpected design book",
        qlooRelevant: true,
        arms: { igor: arm(output, true), baseline: arm(other, false) },
      },
      {
        caseId: "N01",
        goal: "Explain JavaScript promises",
        qlooRelevant: false,
        arms: {
          igor: { ...arm(output, false), qlooEvidenceRefs: [] },
          baseline: arm(other, false),
        },
      },
    ],
  };
}

function votes(packet) {
  return {
    studyId: packet.studyId,
    judgments: packet.cases.map((c) => ({
      reviewerId: "p1",
      caseId: c.caseId,
      winner: "A",
      scores: {
        A: {
          relevance: 5,
          discovery: 4,
          actionability: 4,
          trust: 4,
          coherence: 4,
        },
        B: {
          relevance: 3,
          discovery: 3,
          actionability: 3,
          trust: 3,
          coherence: 3,
        },
      },
    })),
  };
}

test("rejects missing results rather than inventing them", () => {
  const x = input();
  x.runs[0].arms.baseline.output = "";
  assert.throws(() => prepare(x), /Missing observed output/);
});
test("rejects unsupported Qloo evidence claims", () => {
  const x = input();
  x.runs[0].arms.igor.qlooEvidenceRefs = [];
  assert.throws(() => prepare(x), /Actual evidence must match/);
});
test("rejects provider labels in blind output", () => {
  const x = input();
  x.runs[0].arms.igor.output = "Qloo says this is good.";
  assert.throws(() => prepare(x), /De-brand/);
});
test("deterministically balances A/B order and conceals provenance", () => {
  const a = prepare(input());
  const b = prepare(input());
  assert.deepEqual(a.packet, b.packet);
  assert.notEqual(a.key.cases[0].A, a.key.cases[1].A);
  assert.ok(!JSON.stringify(a.packet).includes("qlooEvidenceRefs"));
});
test("scores human judgments without inventing statistical lift", () => {
  const { packet, key } = prepare(input());
  const report = score(key, votes(packet));
  assert.equal(report.judgments, 2);
  assert.equal(report.wins.igor + report.wins.baseline + report.wins.tie, 2);
  assert.match(report.caution, /not proof/);
});
test("rejects duplicate reviewers or incomplete scores", () => {
  const { packet, key } = prepare(input());
  const r = votes(packet);
  r.judgments.push(structuredClone(r.judgments[0]));
  assert.throws(() => score(key, r), /Duplicate reviewer/);
  r.judgments.pop();
  delete r.judgments[0].scores.A.coherence;
  assert.throws(() => score(key, r), /Score must be 1–5/);
});
