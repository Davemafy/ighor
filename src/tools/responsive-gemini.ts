import { z } from "zod";
import { LiveDecisionSchema, type Task } from "../core/contracts";
import { GeminiModel } from "./gemini-model";

/**
 * A fresh conversation should not need the entire cultural/orchestration
 * schema just to greet someone, answer a basic question or ask for missing
 * information. A bounded model-driven routing call can complete these turns
 * without inventing candidates, tools or saved decisions.
 *
 * Substantive execution still delegates to the existing validated protocol.
 */
const Route = z.object({
  intent: z.enum(["conversation", "clarification", "delegate"]),
  reply: z.string().max(1200).optional(),
});

export class ResponsiveGeminiModel extends GeminiModel {
  override async interpret(text: string, context?: Task) {
    const firstTurn =
      context &&
      !context.brief.goal &&
      context.messages.length === 0 &&
      !context.work?.documents.length &&
      !context.artifacts.length &&
      !context.candidates.length &&
      !context.canvas;

    if (!firstTurn) {
      return super.interpret(text, context);
    }

    const prompt = [
      "You are Igor, a helpful general-purpose conversational agent with cultural intelligence.",
      "Route this FIRST turn only. Choose conversation or clarification if you can respond usefully without performing tools or creating work.",
      "Use conversation for greetings or general questions you can answer without live facts.",
      "Use clarification when the user explicitly asks you to ask about missing preferences, location, interests, budget or constraints before doing work. Ask ONE useful natural question in reply, keeping the user's goal in mind.",
      "Use delegate for requests to actually discover, compare, create, research, book, draw, produce an artifact or execute a goal. Do not fulfill those through the lightweight path.",
      "Never claim a tool ran, an external fact is verified, or a document was created. Never invent Qloo evidence. Return a specific, helpful reply for conversation or clarification.",
    ].join(" ");
    const tool = {
      type: "function",
      name: "route_conversation",
      description: "Choose a genuine reply or delegate substantive work to Igor's validated agent.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          intent: {
            type: "string",
            enum: ["conversation", "clarification", "delegate"],
          },
          reply: { type: "string", description: "Required for conversation or clarification; omit for delegate." },
        },
        required: ["intent"],
      },
    };

    // This is a model judgment, not a keyword-driven list of canned replies.
    // Do not retry a failed network request by launching the expensive agent:
    // preserve the provider's safe error category for recovery.
    const first = await this.call(
      [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ],
      [tool],
    );
    if (first.call.name !== "route_conversation") {
      return super.interpret(text, context);
    }

    // Only a malformed quick decision delegates. No semantic action is
    // committed until the reply has passed validation.
    try {
      const decision = Route.parse(JSON.parse(first.call.arguments ?? "{}"));

      if (
        decision.intent === "delegate" ||
        !decision.reply?.trim() ||
        (decision.intent === "conversation" && /\b(?:I have booked|I booked|I created|I saved|I checked availability)\b/i.test(decision.reply))
      ) {
        return super.interpret(text, context);
      }

      return LiveDecisionSchema.parse({
        intent: decision.intent,
        reply: decision.reply.trim(),
      });
    } catch {
      return super.interpret(text, context);
    }
  }
}
