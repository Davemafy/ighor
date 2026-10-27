import { ToolCallingModel } from "./tool-model";

/** xAI Responses uses the same validated function-call protocol. */
export class GrokModel extends ToolCallingModel {
  override timeoutMs = 45000;
  protected override endpoint = "https://api.x.ai/v1/responses";
  protected override providerName = "Grok" as const;
  protected override requestTimeoutMs = 40000;

  constructor(key: string, model = "grok-4.3", transport: typeof fetch = fetch) {
    super(key, model, transport);
  }
}
