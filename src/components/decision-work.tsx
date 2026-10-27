"use client";
import { useState } from "react";
import type { Task } from "@/core/contracts";
import { ProductText } from "./product-surfaces";
import { morphLayout } from "./mobile-transitions";

/** An inspectable view of actual saved options, including decision-only turns. */
export function DecisionWork({ task }: { task: Task }) {
  const [selected, setSelected] = useState<string | null>(null);
  const work = task.work;
  const decisions =
    work?.decisions.filter(
      (decision) => decision.goalId === work.activeGoalId,
    ) ?? [];
  return (
    <section className="iw-decision-work" aria-label="Saved options">
      <h2>
        {work?.goals.find((goal) => goal.id === work.activeGoalId)?.title ||
          "Your options"}
      </h2>
      <p>Working proposals · estimates need checking.</p>
      {decisions.map((decision) => (
        <article key={decision.id} data-open={selected === decision.id}>
          <button
            aria-expanded={selected === decision.id}
            aria-controls={`option-${decision.id}`}
            onClick={() =>
              morphLayout(() =>
                setSelected(selected === decision.id ? null : decision.id),
              )
            }
          >
            <span>
              {decision.title}
              <small>
                {decision.estimatedCost === null
                  ? "Cost not supplied"
                  : `Estimated $${decision.estimatedCost}`}
                {decision.status === "approved"
                  ? " · Approved"
                  : decision.status === "rejected"
                    ? " · Rejected"
                    : ""}
              </small>
            </span>
            <span aria-hidden="true">
              {selected === decision.id ? "−" : "+"}
            </span>
          </button>
          <div id={`option-${decision.id}`} hidden={selected !== decision.id}>
            <ProductText text={decision.value} />
            {decision.rationale && <p>{decision.rationale}</p>}
            {decision.conflict && <p role="status">{decision.conflict}</p>}
          </div>
        </article>
      ))}
    </section>
  );
}
