import { GeminiModel } from "./gemini-model";

/**
 * Gemini shares the same lightweight read-only conversation router as Grok
 * and OpenAI. interpretMessage calls routeConversation for EVERY message,
 * then delegates substantive tasks to GeminiModel.interpret.
 *
 * Keep the existing class/export for production configuration compatibility.
 */
export class ResponsiveGeminiModel extends GeminiModel {}
