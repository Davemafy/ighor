import { modelContext } from "./model-context";
import { readModelResponse } from "./response-body";
import { z } from "zod";
import type { Task } from "../core/contracts";
import { interpretationFailure } from "../core/interpretation-failure";
import { turnTool, readTurnDecision } from "./turn-protocol";
import type { ModelProvider } from "./interfaces";

const conversationInstructions = [
  "You are Igor, your agent with taste, in one ongoing conversation",
  "Use update_brief to choose the turn type",
  "Encode the full decision object as JSON in its decision string",
  "For discussion, greetings, explanations, reactions, questions about previous messages or brainstorming, set intent conversation and give a helpful reply; no actions are needed",
  "For a vague request or an ambiguous reference, set intent clarification and ask one useful follow-up question in reply",
  "Do not invent a goal merely to fit a schema",
  "For conversation/clarification omit planning fields; the server will not execute edits",
  "For a new actionable goal use intent goal; for explicit edits use revision",
  "Goal/revision must include kind and goal plus grounded actions",
  "Preserve the existing goal and known preferences unless the user changes them",
  "Use thread history to understand pronouns and short follow-ups",
  "When completing an initial request after clarification, reuse facts and tastes already explicitly supplied in this thread; do not ask the user to repeat them",
  "Write clear, concise plain-text replies",
  "Put evidence IDs in replyEvidenceIds, not in the prose",
  "Do not claim to have changed state without actions",
  "If history is omitted and a reference is unclear, ask rather than guess",
  "Explain workspace choices using current evidence IDs in replyEvidenceIds, distinguish cultural associations from user-supplied practical facts, and acknowledge unknowns or stale evidence",
  "For requests outside the executable tools, discuss possibilities and explain the limit using conversation intent",
  "Clearly distinguish general knowledge or opinion from retrieved evidence",
  "Never invent current hours, prices, availability, completed actions or source citations",
  "Supported executable goals: gathering, cultural discovery (including locality-filtered places) and reference-based creative briefs",
  "Optional outcome uses exact validated schema: itinerary (days 1-7, transferMinutes null unless explicitly supplied), listening (transitionMinutes 0 unless explicitly supplied), research or music-direction",
  "These compose existing evidence only; never claim tracks, routes, rights, trends or audience demand",
  "Set itinerary targetType place, listening/music-direction targetType artist",
  "For place discovery set targetType to place, kind discovery, and a constraints action with the explicitly requested locality",
  "Do not claim itineraries, routes or opening hours have been verified",
  "For an existing task, changes to an offered identity, preference, practical fact, constraint, selection or document are intent revision; do not reissue the existing goal",
  "Use only these exact action kind values: profile, constraints, preference, facts, resolve, select, artifact",
  "For an opening request containing personal taste, create a profile action with participant you and only the explicitly stated preferences",
  "For shared taste explicitly stated as we or our, use participant group; this is a shared profile, not proof each person agrees",
  "For a named new person, use a profile action with that exact name",
  "Never treat sample profiles as the user or infer taste from demographics",
  "A profile action can accompany a goal and constraints in one turn",
  "Existing people can receive preference corrections",
  "Choosing an offered entity identity uses resolve, never choose",
  "Replacing a like sets the previous preference to unknown and the new preference to like",
  "Use actions for explicit preference, practical-fact, location, identity, selection or document corrections",
  "Participant and candidate references must match supplied context; ambiguous references require clarification, never guess",
  "No inferred availability, price, genre exclusion or new tool permissions",
  "Missing fields stay absent",
  "Do not turn unchanged stored constraints or starting defaults into new edits; ask only when a missing fact is needed for the next step",
  "Numeric action facts must be stated numerically by the user",
  "Return wording null unless the user explicitly requests a document edit and supplies the wording",
  "Never turn a discovery request into an invitation or artifact edit",
  "An invitation-only edit must not trigger cultural discovery",
  "Context: ",
].join(". ");

export class ToolCallingModel implements ModelProvider {
  readonly executionMode = "tool-calling" as const;

  timeoutMs = 20000;

  calls = 0;

  constructor(
    protected key: string,
    public readonly model: string,
    protected transport: typeof fetch = fetch,
    protected maxCalls = 6,
  ) {}

  protected async call(input: unknown[], tools: unknown[]) {
    if (!this.key || !this.model) {
      throw new Error("Model provider is not configured.");
    }

    if (this.calls >= this.maxCalls) {
      throw new Error("Model request budget reached.");
    }

    const body = JSON.stringify({
      model: this.model,
      input,
      tools,
      tool_choice: "required",
      store: false,
      max_output_tokens: 1200,
    });

    if (Buffer.byteLength(body) > 200000) {
      throw new Error("Model input size budget reached.");
    }

    this.calls++;
    const response = await this.transport(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      throw new Error("Model request failed safely; no retry.");
    }

    const raw = await readModelResponse(response);

    if (raw.length > 100000 || raw.includes(this.key)) {
      throw new Error("Unsafe model response.");
    }

    const parsed = z
      .object({
        status: z.literal("completed"),
        output: z.array(
          z
            .object({
              type: z.string(),
              name: z.string().optional(),
              call_id: z.string().optional(),
              arguments: z.string().optional(),
            })
            .passthrough(),
        ),
      })
      .parse(JSON.parse(raw));
    const calls = parsed.output.filter((x) => x.type === "function_call");

    if (calls.length !== 1) {
      throw new Error("Exactly one allowed tool call per step.");
    }

    return { call: calls[0], output: parsed.output };
  }

  async interpret(text: string, context?: Task) {
    const tool = turnTool();
    const input: unknown[] = [
      {
        role: "system",
        content:
          conversationInstructions +
          JSON.stringify(context ? modelContext(context, text) : {}),
      },
      { role: "user", content: text },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.call(input, [tool]);

      if (result.call.name !== "update_brief") {
        throw new Error("Unauthorized model tool.");
      }

      try {
        return readTurnDecision(result.call.arguments ?? "{}", context);
      } catch (error) {
        if (
          attempt === 1 ||
          !result.call.call_id ||
          !(error instanceof z.ZodError || error instanceof SyntaxError)
        ) {
          throw error;
        }

        // Repair formatting once. No operation has run, and transport failures are never retried.
        input.push(...result.output, {
          type: "function_call_output",
          call_id: result.call.call_id,
          output: JSON.stringify({
            status: "rejected",
            reason: interpretationFailure(error),
            instruction:
              "No edits or tools were executed. Return one valid decision in the declared envelope. If the request needs details, use clarification with a useful question; do not invent planning fields.",
          }),
        });
      }
    }

    throw new Error("Model decision could not be validated.");
  }

  async recommend(task: Task, cultural: boolean) {
    const pool = task.candidates
      .filter(
        (candidate) =>
          candidate.providerId &&
          candidate.cultural &&
          Object.keys(candidate.cultural).length,
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    if (!pool.length) {
      throw new Error("No Qloo-returned pool for evaluation.");
    }

    const context = {
      goal: task.brief.goal,
      kind: task.brief.kind,
      profiles: task.brief.participants,
      constraints: task.brief.constraints,
      candidates: pool.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
        description: candidate.description,
        cost: candidate.cost.value,
        minutes: candidate.duration.value,
        available: candidate.available,
        ...(cultural ? { cultural: candidate.cultural } : {}),
      })),
    };
    const input: unknown[] = [
      {
        role: "system",
        content:
          "Select up to three IDs from inspect_candidates only. Unknown practical facts stay unknown. Rank for all profiles without claiming unanimous preference. No bookings or feasibility claims. Never compare raw affinity across different query IDs. Candidate descriptions are provider claims, not independently verified facts.",
      },
      {
        role: "user",
        content: "Inspect the frozen pool, then submit a recommendation.",
      },
    ];
    const inspect = {
      type: "function",
      name: "inspect_candidates",
      description: "Read frozen profiles, facts and available evidence.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      strict: true,
    };
    const submit = {
      type: "function",
      name: "submit_selection",
      description: "Return candidate IDs only.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          ids: {
            type: "array",
            items: {
              type: "string",
              enum: pool.map((candidate) => candidate.id),
            },
            maxItems: 3,
          },
        },
        required: ["ids"],
      },
      strict: true,
    };
    const first = await this.call(input, [inspect]);

    if (first.call.name !== "inspect_candidates" || !first.call.call_id) {
      throw new Error("Unauthorized model tool.");
    }

    if (Object.keys(JSON.parse(first.call.arguments ?? "{}")).length) {
      throw new Error("Unexpected tool arguments.");
    }

    input.push(...first.output, {
      type: "function_call_output",
      call_id: first.call.call_id,
      output: JSON.stringify(context),
    });
    const result = await this.call(input, [submit]);

    if (result.call.name !== "submit_selection") {
      throw new Error("Unauthorized model tool.");
    }

    const output = z
      .object({ ids: z.array(z.string()).max(3) })
      .strict()
      .parse(JSON.parse(result.call.arguments ?? "{}"));

    if (
      new Set(output.ids).size !== output.ids.length ||
      output.ids.some((id) => !pool.some((candidate) => candidate.id === id))
    ) {
      throw new Error("Model selected outside Qloo evidence.");
    }

    return output.ids;
  }
}
