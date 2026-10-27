import { createXai } from "@ai-sdk/xai";
import {
  APICallError,
  generateText,
  jsonSchema,
  tool,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { readModelResponse } from "./response-body";

/** Keep Igor's validated decision protocol while the SDK owns provider I/O. */
export function sdkGrokTransport(
  key: string,
  transport: typeof fetch,
): typeof fetch {
  const xai = createXai({
    apiKey: key,
    fetch: async (url, options) => {
      const response = await transport(url, { ...options, redirect: "error" });

      if (!response.ok) {return new Response(null, { status: response.status });}

      const raw = await readModelResponse(response);

      if (raw.includes(key)) {throw new Error("Unsafe model response.");}

      return new Response(raw, {
        status: response.status,
        headers: response.headers,
      });
    },
  });

  return async (_url, options) => {
    const request = z
      .object({
        model: z.string(),
        input: z.array(z.unknown()),
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            parameters: z.record(z.string(), z.unknown()),
          }),
        ),
      })
      .parse(JSON.parse(String(options?.body)));
    const messages: ModelMessage[] = [];
    const instructions: string[] = [];
    const names = new Map<string, string>();

    for (const value of request.input) {
      const entry = z
        .object({
          role: z.enum(["system", "user", "assistant"]).optional(),
          content: z.string().optional(),
          type: z.string().optional(),
          name: z.string().optional(),
          call_id: z.string().optional(),
          arguments: z.string().optional(),
          output: z.string().optional(),
        })
        .passthrough()
        .parse(value);

      if (entry.role === "system" && entry.content !== undefined) {
        instructions.push(entry.content);
      } else if (entry.role && entry.content !== undefined) {
        messages.push({ role: entry.role, content: entry.content });
      } else if (
        entry.type === "function_call" &&
        entry.call_id &&
        entry.name
      ) {
        names.set(entry.call_id, entry.name);
        messages.push({
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: entry.call_id,
              toolName: entry.name,
              input: JSON.parse(entry.arguments ?? "{}"),
            },
          ],
        });
      } else if (
        entry.type === "function_call_output" &&
        entry.call_id &&
        names.has(entry.call_id)
      ) {
        messages.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: entry.call_id,
              toolName: names.get(entry.call_id)!,
              output: { type: "text", value: entry.output ?? "" },
            },
          ],
        });
      } else {
        throw new Error("Unsupported model protocol input.");
      }
    }

    try {
      const result = await generateText({
        model: xai.responses(request.model),
        instructions: instructions.join("\n"),
        messages,
        tools: Object.fromEntries(
          request.tools.map((definition) => [
            definition.name,
            tool({
              description: definition.description,
              inputSchema: jsonSchema(definition.parameters),
              // Execution remains exclusively in Igor after full decision validation.
            }),
          ]),
        ),
        toolChoice: "required",
        maxRetries: 0,
        maxOutputTokens: 6000,
        abortSignal: options?.signal ?? undefined,
        providerOptions: { xai: { store: false } },
      });

      if (result.finishReason !== "tool-calls") {
        throw new Error("Model request failed: incomplete tool response.");
      }

      return Response.json({
        status: "completed",
        output: result.toolCalls.map((call) => ({
          type: "function_call",
          name: call.toolName,
          call_id: call.toolCallId,
          arguments: JSON.stringify(call.input),
        })),
      });
    } catch (error) {
      if (
        APICallError.isInstance(error) &&
        error.statusCode &&
        error.statusCode >= 400
      ) {
        // Never copy provider bodies (which may include sensitive input) into errors.
        return new Response(null, { status: error.statusCode });
      }

      throw error;
    }
  };
}
