import type { Task } from "./contracts";
import { invalidate } from "./revision";
import {
  emptyWork,
  WorkStateSchema,
  type WorkAction,
  type WorkState,
} from "./work-contracts";

/** Atomic, bounded edits. No model-authored action can grant connector access. */
export function applyWorkActions(
  task: Task,
  actions: WorkAction[],
  text?: string,
) {
  const work = structuredClone(task.work ?? emptyWork());
  const affected = new Set<string>();
  const now = new Date().toISOString();
  const notes: string[] = [];

  const protect = (id: string) => {
    if (
      text !== undefined &&
      !/\b(approve|confirm|accept|reject|edit|change|replace)\b/i.test(text)
    ) {
      throw new Error(`Explicit approval or edit required for ${id}.`);
    }
  };

  const checkEvidence = (ids: string[]) => {
    if (
      ids.some(
        (id) =>
          !task.evidence.some((e) => e.id === id && e.freshness === "current"),
      )
    ) {
      throw new Error("Work cites missing or stale evidence.");
    }
  };

  const archive = (
    item: {
      version: number;
      history: {
        version: number;
        content: string;
        at: string;
        reason: string;
      }[];
    },
    content: string,
    reason: string,
  ) => {
    if (item.history.length >= 100) {
      throw new Error(
        "Revision history limit reached. Start a new document; existing versions are retained.",
      );
    }

    item.history.push({ version: item.version, content, at: now, reason });
    item.version++;
  };

  const dirty = (roots: string[]) => {
    const all = new Set(roots);
    let expanded = true;

    while (expanded) {
      expanded = false;

      for (const item of [...work.decisions, ...work.documents]) {
        const key = `${"value" in item ? "decision" : "document"}:${item.id}`;

        if (item.dependencies.some((d) => all.has(d)) && !all.has(key)) {
          all.add(key);
          expanded = true;
        }
      }
    }

    for (const doc of work.documents) {
      if (all.has(`document:${doc.id}`)) {
        doc.freshness = "stale";

        if (doc.edited || doc.status === "approved") {
          doc.conflict =
            "An input changed. Your approved or edited content is preserved; review the proposed revision.";
        }
      }
    }

    for (const key of all) {
      affected.add(key);
    }
  };

  const budgetEdits = actions.filter(
    (a) => a.kind === "budget" || a.kind === "reduce-budget",
  );

  if (budgetEdits.length > 1) {
    throw new Error("Use one budget correction per turn.");
  }

  const ordered = [
    ...actions.filter((a) => a.kind === "goal"),
    ...budgetEdits,
    ...actions.filter(
      (a) => !["goal", "budget", "reduce-budget"].includes(a.kind),
    ),
  ];

  for (const action of ordered) {
    switch (action.kind) {
      case "goal": {
        const previous = work.goals.find((g) => g.id === action.id);

        if (previous && previous.title !== action.title) {
          throw new Error(
            "Use a new goal identity instead of replacing a previous goal.",
          );
        }

        if (!previous) {
          work.goals.push({ id: action.id, title: action.title });
        }

        work.activeGoalId = action.id;
        notes.push(
          `Working on ${action.title}; previous goals and documents retained.`,
        );
        break;
      }

      case "budget":

      case "reduce-budget": {
        if (action.kind === "reduce-budget" && !work.budget) {
          throw new Error(
            "Confirm a starting budget before applying a percentage reduction.",
          );
        }

        if (text !== undefined) {
          if (action.kind === "reduce-budget") {
            const match =
              /(?:cut|reduce|lower|decrease)[\s\S]{0,40}?\b(\d+(?:\.\d+)?)\s*%/i.exec(
                text,
              );

            if (!match || Number(match[1]) !== action.percent) {
              throw new Error("Budget percentage must be explicitly supplied.");
            }
          } else {
            const match =
              /(?:budget(?:\s+is|\s+of|\s+to|\s*:)?\s*\$?\s*|\$\s*)(\d[\d,]*(?:\.\d+)?)/i.exec(
                text,
              );

            if (
              !match ||
              Number(match[1].replaceAll(",", "")) !== action.amount ||
              /\d\s*%/.test(match[0])
            ) {
              throw new Error("Budget amount must be explicitly supplied.");
            }
          }
        }

        const before = work.budget?.amount;
        const amount =
          action.kind === "budget"
            ? action.amount
            : Math.round(
                work.budget!.amount * (1 - action.percent / 100) * 100,
              ) / 100;

        if (before !== undefined) {
          work.budgetHistory.push({
            amount: before,
            at: now,
            reason: "User changed the confirmed budget",
          });
        }

        work.budget = { amount, confirmed: true, currency: "USD" };
        dirty(["budget"]);
        const locked = work.decisions.filter(
          (d) => d.status === "approved" && d.estimatedCost !== null,
        );
        const fixed = locked.reduce((sum, d) => sum + d.estimatedCost!, 0);

        for (const decision of locked) {
          decision.conflict =
            fixed > amount
              ? `Approved allocations total $${fixed}, exceeding the $${amount} budget. Approval retained; change requires your decision.`
              : null;
        }

        notes.push(
          `Confirmed budget ${before === undefined ? "set" : `changed from $${before}`} to $${amount}. Estimates remain proposals; supplier prices are unverified.`,
        );

        if (fixed > amount) {
          notes.push(
            `Approved allocations exceed the budget by $${Math.round((fixed - amount) * 100) / 100}; no approval was overridden.`,
          );
        }

        break;
      }

      case "decision": {
        checkEvidence(action.evidenceIds);

        if (!work.activeGoalId) {
          throw new Error("A goal is required for new work.");
        }

        const previous = work.decisions.find((d) => d.id === action.id);

        if (previous && previous.goalId !== work.activeGoalId) {
          throw new Error("Decision identity belongs to another goal.");
        }

        if (
          budgetEdits.length &&
          previous &&
          !affected.has(`decision:${action.id}`)
        ) {
          break;
        }

        if (
          previous?.status === "approved" ||
          previous?.status === "rejected"
        ) {
          if (
            previous.value !== action.value ||
            previous.estimatedCost !== action.estimatedCost
          ) {
            previous.conflict = `Proposed alternative: ${action.value}. Your ${previous.status} decision has been retained.`;
            notes.push(`${previous.title}: alternative requires your review.`);
          }

          break;
        }

        const version = previous?.version ?? 1;
        const history = previous?.history ?? [];

        if (previous) {
          archive(
            previous,
            JSON.stringify({
              value: previous.value,
              estimatedCost: previous.estimatedCost,
              rationale: previous.rationale,
            }),
            "Revised creative proposal",
          );
          dirty([`decision:${action.id}`]);
        }

        const next = {
          ...action,
          goalId: work.activeGoalId,
          basis: "creative-proposal" as const,
          status: "proposed" as const,
          conflict: null,
          version: previous?.version ?? version,
          history,
        };

        if (previous) {
          work.decisions[work.decisions.indexOf(previous)] = next;
        } else {
          work.decisions.push(next);
        }

        affected.add(`decision:${action.id}`);
        break;
      }

      case "document": {
        checkEvidence(action.evidenceIds);

        if (!work.activeGoalId) {
          throw new Error("A goal is required for new work.");
        }

        const previous = work.documents.find((d) => d.id === action.id);

        if (previous && previous.goalId !== work.activeGoalId) {
          throw new Error("Document identity belongs to another goal.");
        }

        if (
          budgetEdits.length &&
          previous &&
          !affected.has(`document:${action.id}`)
        ) {
          break;
        }

        if (previous?.edited || previous?.status === "approved") {
          if (previous.content !== action.content) {
            previous.conflict = `Proposed revision (not applied):\n${action.content}`;
            notes.push(
              `${previous.title}: your approved or manually edited version is preserved; a proposed revision is available.`,
            );
          }

          break;
        }

        if (previous) {
          archive(previous, previous.content, "Revised working document");
          dirty([`document:${action.id}`]);
        }

        const next = {
          ...action,
          goalId: work.activeGoalId,
          basis: "creative-proposal" as const,
          edited: false,
          status: "proposed" as const,
          freshness: "current" as const,
          conflict: null,
          version: previous?.version ?? 1,
          history: previous?.history ?? [],
        };

        if (previous) {
          work.documents[work.documents.indexOf(previous)] = next;
        } else {
          work.documents.push(next);
        }

        affected.add(`document:${action.id}`);
        break;
      }

      case "approve":

      case "reject": {
        protect(action.id);
        const item =
          work.decisions.find((d) => d.id === action.id) ??
          work.documents.find((d) => d.id === action.id);

        if (!item) {
          throw new Error("Unknown decision or document.");
        }

        if (
          text !== undefined &&
          !text.toLowerCase().includes(item.title.toLowerCase()) &&
          !text.toLowerCase().includes(item.id.toLowerCase())
        ) {
          throw new Error(
            "Identify the decision or document you want to approve or reject.",
          );
        }

        if (action.kind === "reject" && !("value" in item)) {
          throw new Error("Only decisions can be rejected.");
        }

        if (
          action.kind === "approve" &&
          (item.conflict || ("freshness" in item && item.freshness === "stale"))
        ) {
          throw new Error("Resolve the conflict before approving this work.");
        }

        archive(
          item,
          "value" in item
            ? JSON.stringify({ value: item.value, status: item.status })
            : item.content,
          action.kind,
        );
        item.status = action.kind === "approve" ? "approved" : "rejected";

        if (action.kind === "reject") {
          dirty([`${"value" in item ? "decision" : "document"}:${item.id}`]);
        }

        notes.push(`${item.title}: ${item.status}.`);
        break;
      }

      case "edit": {
        protect(action.id);

        // Natural-language edits must contain the replacement verbatim.
        if (text !== undefined && !text.includes(action.content)) {
          throw new Error(
            "Supply replacement wording explicitly, or request a proposed document revision.",
          );
        }

        const doc = work.documents.find((d) => d.id === action.id);

        if (!doc) {
          throw new Error("Document not found.");
        }

        archive(doc, doc.content, "Manual edit");
        dirty([`document:${doc.id}`]);
        doc.content = action.content;
        doc.edited = true;
        doc.status = "proposed";
        doc.freshness = "current";
        doc.conflict = null;
        notes.push(`${doc.title}: saved your wording.`);
        break;
      }

      case "external":
        work.externalActions.push({
          id: crypto.randomUUID(),
          connector: action.connector,
          action: action.action,
          status: "blocked",
          reason:
            "No authorized execution connector is installed. Nothing was sent, booked or purchased.",
          at: now,
        });
        notes.push(
          `${action.connector}: execution blocked; no external action was performed.`,
        );
        break;
    }
  }

  validateDependencies(work);

  for (const d of work.decisions) {
    if (
      d.conflict ===
      "Proposed allocations exceed the confirmed budget; feasibility is unresolved."
    ) {
      d.conflict = null;
    }
  }

  const proposedTotal = work.decisions
    .filter((d) => d.status !== "rejected")
    .reduce((sum, d) => sum + (d.estimatedCost ?? 0), 0);

  if (work.budget && proposedTotal > work.budget.amount) {
    notes.push(
      `Proposed allocations total $${proposedTotal}, above the $${work.budget.amount} budget. Revise allocations before committing.`,
    );

    for (const d of work.decisions.filter(
      (d) => d.estimatedCost !== null && d.status !== "rejected",
    )) {
      d.conflict ??=
        "Proposed allocations exceed the confirmed budget; feasibility is unresolved.";
    }
  }

  const summary =
    notes.join(" ") ||
    "Updated working proposals. Creative judgment and estimates are not verified facts.";
  work.changes.push({ at: now, summary, affectedIds: [...affected] });
  work.changes = work.changes.slice(-100);
  work.externalActions = work.externalActions.slice(-40);
  task.work = WorkStateSchema.parse(work);

  if (budgetEdits.length && work.budget) {
    invalidate(task, ["budget"]);
    task.brief.constraints.budget = work.budget.amount;
  }

  task.status =
    actions.some((a) => a.kind === "external") ||
    work.documents.some((d) => d.freshness === "stale" || d.conflict) ||
    work.decisions.some((d) => d.conflict)
      ? "partial"
      : "ready";
  task.error = null;
  const documents = actions
    .filter((a) => a.kind === "document")
    .map((a) => work.documents.find((d) => d.id === a.id)!)
    .filter(Boolean);

  return [
    summary,
    ...documents.map(
      (d) =>
        `\n${d.title} (v${d.version}, ${d.status}, ${d.freshness}; creative proposal)\n${d.content}${d.conflict ? `\nNeeds review: ${d.conflict}` : ""}`,
    ),
  ].join("\n\n");
}

function validateDependencies(work: WorkState) {
  const nodes = new Map<string, string[]>([
    ...work.decisions.map((d) => [`decision:${d.id}`, d.dependencies] as const),
    ...work.documents.map((d) => [`document:${d.id}`, d.dependencies] as const),
  ]);
  const roots = new Set(["budget", ...work.goals.map((g) => `goal:${g.id}`)]);
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string) => {
    if (roots.has(key)) {
      return;
    }

    if (visiting.has(key)) {
      throw new Error("Cyclic work dependency.");
    }

    if (visited.has(key)) {
      return;
    }

    const deps = nodes.get(key);

    if (!deps) {
      throw new Error(`Unknown work dependency: ${key}`);
    }

    visiting.add(key);
    deps.forEach(visit);
    visiting.delete(key);
    visited.add(key);
  };

  nodes.forEach((_, key) => visit(key));

  if (
    new Set(work.decisions.map((d) => d.id)).size !== work.decisions.length ||
    new Set(work.documents.map((d) => d.id)).size !== work.documents.length ||
    work.decisions.some((d) => work.documents.some((doc) => doc.id === d.id))
  ) {
    throw new Error("Work identities must be unique.");
  }
}
