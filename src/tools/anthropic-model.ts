import { ToolCallingModel } from "./tool-model";
import { sdkToolTransport } from "./sdk-grok-transport";

export class AnthropicModel extends ToolCallingModel {
  override timeoutMs = 45000;
  protected override providerName = "Claude" as const;
  protected override endpoint = "https://api.anthropic.com/v1/messages";
  protected override requestTimeoutMs = 40000;
  constructor(
    key: string,
    model = "claude-sonnet-4-6",
    transport: typeof fetch = fetch,
  ) {
    super(key, model, sdkToolTransport(key, transport, "anthropic"));
  }
}
