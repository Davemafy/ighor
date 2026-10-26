import { readModelResponse } from "./response-body";
import { OutcomeSpecSchema } from "../core/outcome-spec";
import { z } from "zod";
import {
  InterpretationSchema,
  ConversationActionSchema,
  type Task,
} from "../core/contracts";
import type { ModelProvider } from "./interfaces";

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
    const tool = {
      type: "function",
      name: "update_brief",
      description:
        "Extract a supported goal or explicit correction, without invented facts.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          outcome: z.toJSONSchema(OutcomeSpecSchema),
          targetType: {
            type: "string",
            enum: ["movie", "tv_show", "artist", "place"],
          },
          actions: {
            anyOf: [
              z.toJSONSchema(z.array(ConversationActionSchema).max(8)),
              { type: "null" },
            ],
          },
          supported: { type: "boolean" },
          intent: { type: "string", enum: ["goal", "revision", "unsupported"] },
          kind: {
            type: "string",
            enum: ["gathering", "creative", "discovery"],
          },
          goal: { type: "string" },
          budget: { type: ["number", "null"] },
          duration: { type: ["integer", "null"] },
          wording: { type: ["string", "null"] },
        },
        required: [
          "supported",
          "intent",
          "kind",
          "goal",
          "budget",
          "duration",
          "wording",
        ],
      },
      strict: false,
    };
    const result = await this.call(
      [
        {
          role: "system",
          content:
            "Use update_brief only. Supported goals: gathering, cultural discovery (including locality-filtered places) and reference-based creative briefs. Optional outcome uses exact validated schema: itinerary (days 1-7, transferMinutes null unless explicitly supplied), listening (transitionMinutes 0 unless explicitly supplied), research or music-direction. These compose existing evidence only; never claim tracks, routes, rights, trends or audience demand. Set itinerary targetType place, listening/music-direction targetType artist. For place discovery set targetType to place, kind discovery, and a constraints action with the explicitly requested locality. Do not claim itineraries, routes or opening hours have been verified. For an existing task, changes to an offered identity, preference, practical fact, constraint, selection or document are intent revision; do not reissue the existing goal. Use only these exact action kind values: constraints, preference, facts, resolve, select, artifact. Choosing an offered entity identity uses resolve, never choose. Replacing a like sets the previous preference to unknown and the new preference to like. Use actions for explicit preference, practical-fact, location, identity, selection or document corrections. Participant and candidate references must match supplied context; ambiguous references require clarification, never guess. No inferred availability, price, genre exclusion or new tool permissions. Missing fields stay absent. Numeric action facts must be stated numerically by the user. An invitation-only edit must not trigger cultural discovery. Context: " +
            JSON.stringify(
              context
                ? {
                    goal: context.brief.goal,
                    kind: context.brief.kind,
                    targetType: context.brief.targetType,
                    outcome: context.brief.outcome,
                    constraints: context.brief.constraints,
                    participants: context.brief.participants,
                    candidates: context.catalogue.map((candidate) => ({
                      id: candidate.id,
                      name: candidate.name,
                      type: candidate.type,
                    })),
                    entities: context.entities,
                    artifacts: context.artifacts.map((a) => ({
                      id: a.id,
                      content: a.content,
                    })),
                  }
                : {},
            ),
        },
        { role: "user", content: text },
      ],
      [tool],
    );

    if (result.call.name !== "update_brief") {
      throw new Error("Unauthorized model tool.");
    }

    const data = JSON.parse(result.call.arguments ?? "{}");

    for (const normalizedValue of [
      "budget",
      "duration",
      "wording",
      "actions",
    ]) {
      if (data[normalizedValue] === null) {
        delete data[normalizedValue];
      }
    }

    return InterpretationSchema.parse(data);
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
