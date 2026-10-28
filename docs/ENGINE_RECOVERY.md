# Engine recovery — 28 October 2026

This work extends PR #16's existing routing, Bright Data research, saved work and recovery. It does not replace that infrastructure or redesign the interface.

Before changes, live probes returned only an intake question for a requested game concept/build plan (no saved document), and Grok HTTP 400 for a fully specified New York outing.

## Provider requests

Application function tools now use xAI Chat Completions via AI SDK's compatible provider, pinned to `https://api.x.ai/v1`. The xAI v5 Responses-only provider is no longer used for these requests, and Responses-specific state/include fields are absent. No OpenAI service or key is involved. Claude uses the SDK Anthropic provider. Automatic SDK retries remain disabled; safe schema keywords survive provider errors without raw error bodies or credentials.

Default primary: Grok when XAI_API_KEY or GROK_API_KEY exists. Claude becomes its backup when ANTHROPIC_API_KEY exists; otherwise configured Gemini is available. Only one backup is selected. ANTHROPIC_MODEL defaults to claude-sonnet-4-6. IGOR_MODEL_PROVIDER can explicitly select grok, claude, gemini or openai when configured. Authentication failures are surfaced without repeated retries.

Within one turn, after a recoverable provider failure, subsequent routing, authoring and synthesis remain on the healthy backup. An absent primary synthesis implementation cannot cause the backup to be called twice.

## First deliverables in the engine branch

A small draft route and compose_draft tool create a real editable document from supplied facts and labelled creative assumptions, without requiring Qloo or the large planning schema. Existing approved/manual artifacts remain intact. Revisions and cultural discovery keep their validated paths. A draft is not code execution, deployment, external action or live verification.

## Search parsing

Bright Data parsing retains valid organic results when a neighboring rich result is malformed, descriptions are null, images use an object URL, or parsed JSON is wrapped in a body envelope. Existing public-URL checks and response/request budgets remain. This does not configure an absent reading zone or turn snippets into verified pages.

Adapter tests simulate provider responses. Live deployed verification remains necessary before claiming end-to-end success. The provider transport fix is suitable for main independently; the full PR #16 integration retains its existing review gate.
