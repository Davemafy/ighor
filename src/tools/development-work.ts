import type { Task, ModelInterpretation } from "../core/contracts";
import type { WorkAction } from "../core/work-contracts";

/** Explicitly scripted test/demo proposals. Production uses the configured model. */
export function developmentWork(
  text: string,
  task?: Task,
): ModelInterpretation | null {
  const work = task?.work;
  const reply = (actions: WorkAction[]): ModelInterpretation => ({
    intent: work?.goals.length ? "revision" : "goal",
    kind: "creative",
    goal: "Connected working proposals",
    workActions: actions,
  });
  const budget =
    /(?:budget(?:\s+is|\s+of|\s+to|\s*:)?\s*\$?\s*)(\d[\d,]*(?:\.\d+)?)/i.exec(
      text,
    );
  const cut =
    /(?:cut|reduce|lower|decrease)[\s\S]{0,40}?\b(\d+(?:\.\d+)?)\s*%/i.exec(
      text,
    );
  const approval = /^(approve|reject)\s+(.+?)\.?$/i.exec(text.trim());

  const manual = /^edit ([a-z][a-z0-9-]*):\s*([\s\S]+)$/i.exec(text);

  if (work?.documents.some((d) => d.id === manual?.[1]) && manual) {
    return reply([{ kind: "edit", id: manual[1], content: manual[2] }]);
  }

  if (work?.goals.length && approval) {
    const target = [...work.decisions, ...work.documents].find(
      (d) =>
        d.id.toLowerCase() === approval[2].toLowerCase() ||
        d.title.toLowerCase() === approval[2].toLowerCase(),
    );

    if (target) {
      return reply([
        {
          kind: approval[1].toLowerCase() as "approve" | "reject",
          id: target.id,
        },
      ]);
    }
  }

  if (work?.goals.length && (budget || cut)) {
    if (cut && !work.budget) {
      return {
        intent: "clarification",
        reply:
          "What starting budget should I use for that percentage reduction?",
      };
    }

    const amount = budget
      ? Number(budget[1].replaceAll(",", ""))
      : Math.round(work!.budget!.amount * (1 - Number(cut![1]) / 100) * 100) /
        100;
    const actions: WorkAction[] = [
      cut
        ? { kind: "reduce-budget", percent: Number(cut[1]) }
        : { kind: "budget", amount },
    ];
    const fixed = work.decisions
      .filter((d) => d.status === "approved")
      .reduce((s, d) => s + (d.estimatedCost ?? 0), 0);
    const adjustable = work.decisions.filter(
      (d) => d.status === "proposed" && d.dependencies.includes("budget"),
    );

    for (const d of adjustable) {
      actions.push({
        kind: "decision",
        id: d.id,
        title: d.title,
        value: d.value,
        rationale:
          "Illustrative reallocation after retaining approved decisions. Reduce scope before compromising the core identity; supplier quotes remain unknown.",
        estimatedCost:
          Math.floor(
            (Math.max(0, amount - fixed) / Math.max(1, adjustable.length)) *
              100,
          ) / 100,
        dependencies: d.dependencies,
        evidenceIds: d.evidenceIds,
      });
    }

    for (const d of work.documents.filter(
      (d) =>
        d.dependencies.includes("budget") &&
        !d.edited &&
        d.status !== "approved",
    )) {
      actions.push({
        kind: "document",
        id: d.id,
        title: d.title,
        content: `Scripted development proposal. Confirmed budget: $${amount}. Preserve the approved identity. Start with a smaller programme and fewer refreshments; defer decorative purchases. Obtain quotes before committing. Approved decisions and manual wording are retained.`,
        dependencies: d.dependencies,
        evidenceIds: d.evidenceIds,
      });
    }

    return reply(actions);
  }

  if (/\b(send|book|purchase)\b/i.test(text) && work?.goals.length) {
    return reply([
      { kind: "external", connector: "unavailable", action: text },
    ]);
  }

  const framework = /research three frontend frameworks/i.test(text);

  if (framework) {
    return reply([
      {
        kind: "goal",
        id: "framework-review",
        title: "Frontend framework recommendation",
      },
      {
        kind: "decision",
        id: "framework-choice",
        title: "Framework recommendation",
        value:
          "Use React if the team's existing React skills and ecosystem needs are the deciding factors; compare alternatives before committing.",
        estimatedCost: null,
        rationale:
          "Recorded development example, not current-source research or a validated performance comparison.",
        dependencies: ["goal:framework-review"],
        evidenceIds: [],
      },
      {
        kind: "document",
        id: "framework-report",
        title: "Technical recommendation",
        content:
          "Recorded development fixture, not live research. Compare React's library-oriented approach, Vue's progressive framework approach and Angular's integrated framework approach. Select against team experience, project requirements and maintenance needs. The provisional recommendation preserves the team's React experience. Consult current official documentation before deciding.",
        dependencies: ["goal:framework-review", "decision:framework-choice"],
        evidenceIds: [],
      },
    ]);
  }

  if (
    work?.documents.some((d) => d.id === "framework-report") &&
    /beginner developers|shorten the report/i.test(text)
  ) {
    return reply([
      {
        kind: "goal",
        id: "framework-review",
        title: "Frontend framework recommendation",
      },
      {
        kind: "document",
        id: "framework-report",
        title: "Technical recommendation",
        content:
          "Recorded development fixture, shortened for beginners. Keep the provisional React recommendation. React helps build interactive interfaces; Vue offers a progressive framework; Angular provides an integrated framework. Start with team skills and a small prototype. Check official documentation; no live research was performed.",
        dependencies: ["goal:framework-review", "decision:framework-choice"],
        evidenceIds: [],
      },
    ]);
  }

  const hospitality = /\b(listening bar|hospitality concept)\b/i.test(text);
  const everyday =
    /\b(organize|organise|plan|launch)\b[\s\S]*\b(book club|study group|community workshop)\b/i.test(
      text,
    );

  if (!hospitality && !everyday) {
    return null;
  }

  const id = hospitality ? "listening-bar" : "community-plan";
  const identity = hospitality ? "Musical identity" : "Learning identity";
  const actions: WorkAction[] = [
    {
      kind: "goal",
      id,
      title: hospitality
        ? "Launch a small listening bar"
        : "Organize a community workshop",
    },
  ];

  if (budget) {
    actions.push({
      kind: "budget",
      amount: Number(budget[1].replaceAll(",", "")),
    });
  }

  actions.push(
    {
      kind: "decision",
      id: `${id}-identity`,
      title: identity,
      value: hospitality
        ? "Alternative music and independent art, with room for conversation"
        : "A welcoming, discussion-led session with time for questions",
      estimatedCost: null,
      rationale:
        "Creative proposal based on the stated goal, not a measured audience finding.",
      dependencies: [`goal:${id}`],
      evidenceIds: [],
    },
    {
      kind: "decision",
      id: `${id}-format`,
      title: hospitality ? "Launch format" : "Session format",
      value:
        "Begin with a small pilot using existing resources before expanding.",
      estimatedCost: null,
      rationale:
        "Test the experience before spending on additional scope; feasibility still requires quotes.",
      dependencies: [`goal:${id}`, "budget"],
      evidenceIds: [],
    },
    {
      kind: "decision",
      id: `${id}-refreshments`,
      title: "Refreshments",
      value:
        "Offer a short optional menu with simple preparation; confirm dietary needs.",
      estimatedCost: null,
      rationale:
        "A limited selection reduces operational complexity. This is a proposal, not a cost estimate.",
      dependencies: [`goal:${id}`, "budget"],
      evidenceIds: [],
    },
  );
  const docs = [
    [
      "concept",
      "Audience and concept",
      hospitality
        ? "An intimate listening space for alternative music and independent art. Validate this audience hypothesis with prospective guests."
        : "A small learning group with a clear topic, shared references and room for different levels of experience.",
    ],
    [
      "references",
      "Cultural references",
      "No cultural evidence has been retrieved for this concept. Supply confirmed artists, books, films or places when you want a Qloo-backed reference search. This draft does not depend on that search.",
    ],
    [
      "direction",
      hospitality ? "Music direction" : "Programme direction",
      hospitality
        ? "Propose a conversational opening, a focused listening segment and space to discuss independent art. Specific artists, tracks, rights and sound levels remain unverified."
        : "Propose a short introduction, guided discussion and a practical exercise. Confirm topic, references and participant needs.",
    ],
    [
      "menu",
      "Proposed menu",
      "Keep a small optional refreshment offer and confirm dietary needs before preparing food. No ingredient prices, quantities or availability have been verified.",
    ],
    [
      "atmosphere",
      hospitality ? "Atmosphere" : "Materials and atmosphere",
      "Use existing furniture, clear sight lines and a small optional refreshment offer. These are creative suggestions; costs, dietary requirements and venue conditions need confirmation.",
    ],
    [
      "allocation",
      "Budget allocation",
      "No supplier costs are verified. Confirm a total budget, then propose allocations for the pilot, refreshments and essential materials. Keep contingency explicit.",
    ],
    [
      "launch",
      "Launch brief",
      "Run a small pilot, gather feedback and expand only after learning what works. Resolve venue, availability, costs and access before committing.",
    ],
    [
      "invite",
      "Invitation draft",
      hospitality
        ? "You’re invited to an evening of alternative music and independent art. Date and venue to be confirmed. Tell us about access or dietary needs."
        : "Join a friendly community learning session. Topic, date and venue to be confirmed. Bring your questions.",
    ],
  ];

  for (const [suffix, title, content] of docs) {
    actions.push({
      kind: "document",
      id: `${id}-${suffix}`,
      title,
      content: `Scripted development proposal. ${content}`,
      dependencies: [
        `goal:${id}`,
        `decision:${id}-identity`,
        ...(["menu", "atmosphere", "allocation", "launch"].includes(suffix)
          ? ["budget", `decision:${id}-format`, `decision:${id}-refreshments`]
          : []),
      ],
      evidenceIds: [],
    });
  }

  return reply(actions);
}
