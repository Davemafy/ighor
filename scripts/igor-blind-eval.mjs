#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const METRICS = ["relevance", "discovery", "actionability", "trust", "coherence"];
const branded = /\b(qloo|igor|chatgpt|claude|gemini|manus)\b/i;
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}
export function validateInput(study) {
  check(study && text(study.studyId) && Array.isArray(study.runs) && study.runs.length, "Missing studyId or real run pairs");
  check(new Set(study.runs.map((run) => run.caseId)).size === study.runs.length, "Duplicate case ID");
  for (const run of study.runs) {
    check(text(run.caseId) && text(run.goal) && typeof run.qlooRelevant === "boolean", "Run requires caseId, goal and qlooRelevant");
    for (const armName of ["igor", "baseline"]) {
      const arm = run.arms?.[armName];
      check(arm && text(arm.output), "Missing observed output: " + run.caseId + "/" + armName);
      check(!branded.test(arm.output), "De-brand blinded output without changing content: " + run.caseId + "/" + armName);
      check(text(arm.model) && text(arm.toolPolicy), "Document model and tool policy: " + run.caseId);
      check(Number.isInteger(arm.elapsedMs) && arm.elapsedMs >= 0, "Missing execution time: " + run.caseId);
      check(Array.isArray(arm.sourceRefs) && arm.sourceRefs.every(text), "Missing source reference array: " + run.caseId);
    }
    check(Array.isArray(run.arms.igor.qlooEvidenceRefs) && run.arms.igor.qlooEvidenceRefs.every(text), "Missing Qloo evidence metadata");
    check(run.qlooRelevant === (run.arms.igor.qlooEvidenceRefs.length > 0), "Actual evidence must match cultural treatment flag: " + run.caseId);
    check(!run.arms.baseline.qlooEvidenceRefs?.length, "Baseline must not use Qloo");
  }
  return study;
}

export function prepare(study) {
  validateInput(study);
  const bit = createHash("sha256").update(study.studyId).digest()[0] % 2;
  const packet = { studyId: study.studyId, metrics: METRICS, cases: [] };
  const key = { studyId: study.studyId, sealed: true, cases: [] };
  study.runs.forEach((run, index) => {
    const A = (index + bit) % 2 === 0 ? "igor" : "baseline";
    const B = A === "igor" ? "baseline" : "igor";
    packet.cases.push({ caseId: run.caseId, goal: run.goal, constraints: run.constraints || "", A: run.arms[A].output, B: run.arms[B].output });
    key.cases.push({ caseId: run.caseId, A, B, qlooRelevant: run.qlooRelevant, provenance: {
      igor: { model: run.arms.igor.model, toolPolicy: run.arms.igor.toolPolicy, elapsedMs: run.arms.igor.elapsedMs, sourceRefs: run.arms.igor.sourceRefs, qlooEvidenceRefs: run.arms.igor.qlooEvidenceRefs },
      baseline: { model: run.arms.baseline.model, toolPolicy: run.arms.baseline.toolPolicy, elapsedMs: run.arms.baseline.elapsedMs, sourceRefs: run.arms.baseline.sourceRefs },
    } });
  });
  return { packet, key };
}

export function score(key, ratings) {
  check(key?.sealed && Array.isArray(key.cases), "A private key is required");
  check(ratings?.studyId === key.studyId && Array.isArray(ratings.judgments), "Study ID mismatch or missing human judgments");
  const byCase = new Map(key.cases.map((c) => [c.caseId, c]));
  const seen = new Set();
  const wins = { igor: 0, baseline: 0, tie: 0 };
  const totals = Object.fromEntries(METRICS.map((m) => [m, { igor: 0, baseline: 0 }]));
  const records = [];
  for (const row of ratings.judgments) {
    check(text(row.reviewerId) && byCase.has(row.caseId), "Unknown reviewer or case");
    const id = row.reviewerId + ":" + row.caseId;
    check(!seen.has(id), "Duplicate reviewer/case judgment: " + id);
    seen.add(id);
    check(["A", "B", "tie"].includes(row.winner), "Overall preference must be A, B or tie");
    const mapping = byCase.get(row.caseId);
    for (const metric of METRICS) {
      for (const label of ["A", "B"]) {
        const number = row.scores?.[label]?.[metric];
        check(Number.isInteger(number) && number >= 1 && number <= 5, "Score must be 1–5: " + id + "/" + label + "/" + metric);
        totals[metric][mapping[label]] += number;
      }
    }
    const winner = row.winner === "tie" ? "tie" : mapping[row.winner];
    wins[winner]++;
    records.push({ caseId: row.caseId, reviewerId: row.reviewerId, winner, qlooRelevant: mapping.qlooRelevant });
  }
  check(records.length, "At least one genuine human judgment required");
  const means = Object.fromEntries(METRICS.map((m) => [m, {
    igor: Number((totals[m].igor / records.length).toFixed(2)),
    baseline: Number((totals[m].baseline / records.length).toFixed(2)),
  }]));
  const cultural = records.filter((r) => r.qlooRelevant);
  return {
    studyId: key.studyId,
    judgments: records.length,
    reviewers: new Set(records.map((r) => r.reviewerId)).size,
    cases: new Set(records.map((r) => r.caseId)).size,
    wins, meanScores: means,
    cultural: { judgments: cultural.length, igorWins: cultural.filter((r) => r.winner === "igor").length,
      baselineWins: cultural.filter((r) => r.winner === "baseline").length, ties: cultural.filter((r) => r.winner === "tie").length },
    caution: "Descriptive, blinded human ratings only; not proof of statistically significant lift or isolated Qloo causality. Audit factual claims and model/tool parity separately.",
  };
}

if (process.argv[1]?.endsWith("igor-blind-eval.mjs")) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "prepare" && args.length === 2) {
      const { packet, key } = prepare(JSON.parse(readFileSync(args[0], "utf8")));
      mkdirSync(args[1], { recursive: true });
      writeFileSync(join(args[1], "blind-packet.json"), JSON.stringify(packet, null, 2) + "\n", { flag: "wx" });
      writeFileSync(join(args[1], "key.json"), JSON.stringify(key, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      console.log("Prepared " + packet.cases.length + " real comparison pairs. Protect key.json.");
    } else if (mode === "score" && args.length === 3) {
      const result = score(JSON.parse(readFileSync(args[0], "utf8")), JSON.parse(readFileSync(args[1], "utf8")));
      mkdirSync(dirname(args[2]), { recursive: true });
      writeFileSync(args[2], JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
      console.log("Analyzed " + result.judgments + " judgments. No statistical significance implied.");
    } else throw new Error("Usage: prepare <collected-runs.json> <output-dir> | score <key.json> <ratings.json> <report.json>");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
