import { afterEach, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductText } from "../../src/components/product-surfaces";
import {
  PresentationSchema,
  installPresentation,
} from "../../src/core/presentation";
import { groundQuestionAnswer } from "../../src/core/question-grounding";
import { applyConversationActions } from "../../src/core/conversation";
import { freshTask } from "../../src/data/fixtures";
import { SqliteTaskStore } from "../../src/data/store";
import { runTurn } from "../../src/core/orchestrator";
import { modelContext } from "../../src/tools/model-context";

const stores: SqliteTaskStore[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.close()));
const form = () =>
  PresentationSchema.parse({
    id: "group-form",
    title: "Group Plan Details",
    basis: "draft",
    root: "details",
    nodes: [
      {
        id: "details",
        type: "question",
        subject: "group",
        prompt: "Tell us about your group plan",
        fields: [
          {
            id: "location",
            label: "Location",
            type: "text",
            binding: "location",
          },
          { id: "interests", label: "Interests & Activities", type: "text" },
          { id: "budget", label: "Budget (USD)", type: "number" },
          { id: "duration", label: "Duration (minutes)", type: "number" },
        ],
      },
    ],
  });

it("accepts the recording's explicit $50 and 50-minute form without mixing numeric fields", async () => {
  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  const task = freshTask("form-values", "owner");
  task.canvas = installPresentation(undefined, form());
  task.mode = "qloo-live";
  task.catalogue = [];
  task.brief.participants = [];
  store.create(task);
  let contextBudget: unknown;
  const result = await runTurn(
    store,
    task.id,
    "owner",
    {
      type: "canvas",
      surfaceId: "group-form",
      mutation: {
        operation: "answer",
        nodeId: "details",
        values: {
          location: "Malé",
          interests: "Food",
          budget: "50",
          duration: "50",
        },
      },
      version: 0,
    },
    undefined,
    undefined,
    {
      interpret: async (text, current) => {
        contextBudget =
          current && modelContext(current, text).constraints.budget;

        return {
          intent: "goal",
          supported: true,
          kind: "creative",
          goal: "A group plan in Malé",
          actions: [
            { kind: "constraints", budget: 50, duration: 50, location: "Malé" },
          ],
          workActions: [
            { kind: "goal", id: "group-plan", title: "Group plan" },
            { kind: "budget", amount: 50 },
            {
              kind: "document",
              id: "plan",
              title: "Group plan draft",
              content:
                "A draft plan with an explicit $50 limit and 50 minutes.\n\n- Check the group's preferences.\n- Confirm practical availability.",
              dependencies: ["goal:group-plan", "budget"],
              evidenceIds: [],
            },
          ],
        };
      },
    },
  );
  expect(contextBudget).toBe(50);
  expect(result.status).toBe("ready");
  expect(result.brief.constraints).toMatchObject({
    budget: 50,
    duration: 50,
    location: "Malé",
  });
  expect(result.work?.budget?.amount).toBe(50);
  expect(result.messages.at(-1)?.text).toContain("ready to review below");
  expect(result.messages.at(-1)?.text).not.toContain("#");
  expect(result.messages.at(-1)?.text).not.toContain("explicit $50 limit");
  expect(result.work?.documents[0].content).toContain("explicit $50 limit");
  expect(
    store.load(task.id, "owner").canvas?.answers["group-form:details"].budget,
  ).toBe("50");
});

it("does not use a duration value as a spending limit", () => {
  const task = freshTask("distinct", "owner");
  const surface = form();
  const node = surface.nodes[0];

  if (node.type !== "question") {
    throw Error("fixture");
  }

  const grounded = groundQuestionAnswer(node, {
    budget: "50",
    duration: "90",
    location: "Malé",
    interests: "Food",
  });
  expect(
    applyConversationActions(
      task,
      [{ kind: "constraints", budget: 90 }],
      "Budget (USD): 50\nDuration (minutes): 90",
      grounded,
    ).ok,
  ).toBe(false);
  expect(task.brief.constraints.budget).toBe(60);
});

it("supports explicit hour units without treating a per-person label as a total budget", () => {
  const surface = PresentationSchema.parse({
    id: "hours",
    title: "Time",
    basis: "draft",
    root: "input",
    nodes: [
      {
        id: "input",
        type: "question",
        prompt: "How long?",
        fields: [
          {
            id: "hours",
            label: "How long?",
            type: "number",
            binding: "duration-hours",
          },
          {
            id: "budget",
            label: "Budget per person ($)",
            type: "number",
            binding: "budget-per-person",
          },
        ],
      },
    ],
  });
  const node = surface.nodes[0];

  if (node.type !== "question") {
    throw Error("fixture");
  }

  const grounded = groundQuestionAnswer(node, { hours: "2", budget: "50" });
  expect(grounded.constraints).toEqual({ duration: 120 });
});

it("uses the asked recipient context without inventing a cultural identity or persistent memory", () => {
  const task = freshTask("recipient", "owner");
  task.brief.participants = [];
  task.messages.push({
    role: "user",
    text: "My mum",
    at: new Date().toISOString(),
  });
  const result = applyConversationActions(
    task,
    [
      {
        kind: "profile",
        participant: "Mum",
        preferences: [{ value: "Amala", polarity: "like" }],
      },
    ],
    "Interests or hobbies: Amala",
    {
      subject: "you",
      question: "What sorts of things does your mum enjoy?",
      values: ["Amala"],
    },
  );
  expect(result.ok).toBe(true);

  if (!result.ok) {
    return;
  }

  expect(result.task.brief.participants[0].name).toBe("Mum");
  expect(result.task.brief.participants[0].preferences[0].value).toBe("Amala");
  expect(
    result.task.brief.participants[0].preferences[0].entityType,
  ).toBeUndefined();
  expect(result.task.preferences).toEqual([]);
  const unrelated = applyConversationActions(
    task,
    [
      {
        kind: "profile",
        participant: "Alex",
        preferences: [{ value: "Amala", polarity: "like" }],
      },
    ],
    "Interests: Amala",
    { subject: "you", question: "What does Mum enjoy?", values: ["Amala"] },
  );
  expect(unrelated.ok).toBe(false);
});

it("keeps unconfirmed starting constraints out of the model's factual context", () => {
  const task = freshTask("defaults", "owner");
  expect(modelContext(task, "Find a gift").constraints).toMatchObject({
    budget: null,
    duration: null,
    location: null,
  });
  expect(task.brief.constraints.budget).toBe(60);
});

it("renders headings and lists as safe markup rather than raw Markdown", () => {
  const markup = renderToStaticMarkup(
    createElement(ProductText, {
      text: "# Gift ideas\n\n- **Food sculpture**\n- <script>alert(1)</script>\n\n1. Compare options\n2. Choose one",
    }),
  );
  expect(markup).toContain("<h3>Gift ideas</h3>");
  expect(markup).toContain("<ul>");
  expect(markup).toContain("<ol>");
  expect(markup).toContain("<strong>Food sculpture</strong>");
  expect(markup).not.toContain("<script>");
  expect(markup).toContain("&lt;script&gt;");
});

it("does not treat a copied movie request as replacement document wording", async () => {
  const store = new SqliteTaskStore(":memory:");
  stores.push(store);
  const task = freshTask("movie-copy", "owner");
  store.create(task);
  const text =
    "Find movies based on my interest in nujabes. Show the returned references so I can explore them and save the ones I like to a collection.";
  const result = await runTurn(
    store,
    task.id,
    "owner",
    { type: "message", text, version: task.brief.version },
    undefined,
    undefined,
    {
      interpret: async () => ({
        intent: "goal",
        supported: true,
        kind: "discovery",
        goal: text,
        targetType: "movie",
        actions: [
          { kind: "artifact", artifactId: "main", content: text },
          {
            kind: "profile",
            participant: "you",
            preferences: [
              { value: "nujabes", polarity: "like", entityType: "artist" },
            ],
          },
        ],
      }),
    },
  );
  expect(
    result.messages.some((message) =>
      message.text.includes("Save the document wording separately"),
    ),
  ).toBe(false);
  expect(
    result.trace.some((entry) => entry.action === "proposal.ignored"),
  ).toBe(true);
});
