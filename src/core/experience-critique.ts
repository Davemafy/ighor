import { culturalEvidenceId } from "./cultural-evidence";
import type { Task } from "./contracts";
import type { z } from "zod";
import type { ExperienceCritiqueSchema } from "./work-contracts";

type Critique = z.infer<typeof ExperienceCritiqueSchema>;

/** Independent deterministic checks, never model praise or an invented fit score.
 * Unknown supplier facts and subjective pairings remain explicitly unresolved. */
export function critiqueExperience(task: Task): Critique {
  const issues: Critique["issues"] = [];
  const work = task.work;

  const add = (
    kind: Critique["issues"][number]["kind"],
    severity: "error" | "warning",
    nodes: string[],
    message: string,
    action: string,
  ) => {
    if (issues.length < 200) {
      issues.push({
        id: `${kind}:${nodes.join(":")}`,
        kind,
        severity,
        nodeIds: nodes,
        message,
        action,
      });
    }
  };

  if (!work) {
    return { at: new Date().toISOString(), issues };
  }

  const decisions = work.decisions.filter(
    (d) => d.status !== "rejected" && d.goalId === work.activeGoalId,
  );
  const total = decisions.reduce((n, d) => n + (d.estimatedCost ?? 0), 0);

  if (work.budget?.confirmed && total > work.budget.amount) {
    add(
      "budget",
      "error",
      decisions.filter((d) => d.estimatedCost !== null).map((d) => d.id),
      `Proposed allocations ${total} exceed the confirmed ${work.budget.amount} ${work.budget.currency} budget.`,
      "Reduce affected allocations or ask the owner to change the budget; retain approvals.",
    );
  }

  for (const d of decisions) {
    if (d.freshness === "stale") {
      add(
        "stale",
        "error",
        [d.id],
        "An upstream input changed; this decision needs review.",
        "Refresh affected evidence or propose a revision without replacing approved content.",
      );
    }

    if (d.estimatedCost === null) {
      add(
        "unknown",
        "warning",
        [d.id],
        "Cost is unknown, not zero.",
        "Obtain a current quote or keep the allocation explicitly provisional.",
      );
    }

    if (
      d.evidenceIds.some(
        (id) =>
          !task.evidence.some((e) => e.id === id && e.freshness === "current"),
      )
    ) {
      add(
        "source",
        "error",
        [d.id],
        "A decision cites missing or superseded evidence.",
        "Use current evidence from the same task or label the rationale as interpretation.",
      );
    }

    if (d.rationaleKind === "cultural-evidence") {
      const candidates = task.candidates.filter(
        (c) =>
          c.freshness === "current" &&
          !c.sample &&
          (d.candidateIds ?? []).includes(c.id),
      );
      const expectedType =
        d.domain === "music"
          ? "artist"
          : ["food", "venue"].includes(d.domain ?? "")
            ? "place"
            : null;
      const requiredSeeds = new Set(
        (task.agentRun?.requirements?.culturalReferences ?? []).flatMap(
          (name) =>
            task.entities
              .filter(
                (e) =>
                  e.status === "resolved" &&
                  e.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
              )
              .map((e) => e.providerId),
        ),
      );
      const valid = candidates.some(
        (c) =>
          (!expectedType || c.type === expectedType) &&
          Object.entries(c.cultural ?? {}).some(([scope, signal]) => {
            const id = culturalEvidenceId(c, scope, signal);

            return (
              signal.seedIds.length > 0 &&
              (!requiredSeeds.size ||
                signal.seedIds.some((seed) => requiredSeeds.has(seed))) &&
              d.evidenceIds.includes(id) &&
              task.evidence.some(
                (e) =>
                  e.id === id &&
                  e.kind === "cultural" &&
                  e.freshness === "current" &&
                  e.entityIds.includes(c.providerId ?? c.id) &&
                  ["provider-returned", "recorded-fixture"].includes(e.source),
              )
            );
          }),
      );

      if (!valid) {
        add(
          "source",
          "error",
          [d.id],
          "The cultural rationale is not bound to an actual current candidate and its Qloo evidence.",
          "Discover and cite the relevant candidate/query evidence, or explicitly use interpretation.",
        );
      }
    }

    if (
      d.rationaleKind === "practical-evidence" &&
      !d.evidenceIds.some((id) =>
        task.evidence.some(
          (e) =>
            e.id === id &&
            e.kind === "practical" &&
            e.freshness === "current" &&
            e.source === "provider-returned",
        ),
      )
    ) {
      add(
        "source",
        "error",
        [d.id],
        "Cultural evidence cannot establish practical availability, price or operating conditions.",
        "Retrieve a relevant practical source and retain its limitations.",
      );
    }

    if (["food", "venue", "schedule"].includes(d.domain ?? "general")) {
      add(
        "unknown",
        "warning",
        [d.id],
        "This practical choice remains a proposal; availability, suitability and supplier prices are unverified.",
        "Confirm practical details before committing externally.",
      );
    }

    if (
      work.restrictions?.alcoholFree &&
      (d.containsAlcohol === true ||
        (/\b(wine|beer|spirits|cocktails?|vodka|whisky|whiskey|gin|rum)\b/i.test(
          d.value,
        ) &&
          !/\b(non[- ]?alcoholic|alcohol[- ]free|mocktails?)\b/i.test(d.value)))
    ) {
      add(
        "restriction",
        "error",
        [d.id],
        "This choice conflicts with the confirmed alcohol-free requirement.",
        "Propose an alcohol-free alternative; preserve any approved version for explicit review.",
      );
    }

    if (
      d.domain &&
      ["food", "atmosphere", "venue", "identity"].includes(d.domain)
    ) {
      const linked = new Set<string>();

      const visit = (node: typeof d) => {
        for (const dependency of node.dependencies) {
          const parent = decisions.find(
            (x) => `decision:${x.id}` === dependency,
          );

          if (parent && !linked.has(parent.id)) {
            linked.add(parent.id);
            visit(parent);
          }
        }
      };

      visit(d);

      if (
        !decisions.some(
          (p) =>
            linked.has(p.id) &&
            ["audience", "culture", "music"].includes(p.domain ?? "general"),
        )
      ) {
        add(
          "coherence",
          "warning",
          [d.id],
          "This domain has no explicit dependency path to its audience or cultural/music direction.",
          "Explain and link the decisions rather than concatenating unrelated recommendations.",
        );
      }
    }
  }

  const timed = decisions.filter((d) => d.schedule);

  for (let a = 0; a < timed.length; a++) {
    for (let b = a + 1; b < timed.length; b++) {
      const left = timed[a];
      const right = timed[b];
      const x = left.schedule!;
      const y = right.schedule!;

      if (x.exclusive === false || y.exclusive === false) {
        continue;
      }

      if (
        x.startMinute < y.startMinute + y.durationMinutes &&
        y.startMinute < x.startMinute + x.durationMinutes
      ) {
        add(
          "schedule",
          "error",
          [left.id, right.id],
          "Planned activities overlap.",
          "Adjust the schedule or explicitly model parallel activities before approval.",
        );
      }
    }
  }

  return { at: new Date().toISOString(), issues };
}
