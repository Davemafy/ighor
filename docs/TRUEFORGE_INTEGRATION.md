# TrueForge in Igor — opt-in delegated agent harness

**Status:** integrated code, disabled by default; not yet demonstrated against a running TrueForge service. Only deterministic mock-server contract tests are run in public CI.

Upstream: [truefoundry/trueforge](https://github.com/truefoundry/trueforge) — MIT-licensed agent harness. The protocol in `src/tools/trueforge.ts` follows its published [Sessions/Turns HTTP API](https://github.com/truefoundry/trueforge/blob/main/docs/api/quickstart.mdx). This is an Igor-authored HTTP adapter; we do **not** bundle TrueForge's UI or copy its SDK source.

## Why this boundary

Igor already owns authenticated user workspaces, Qloo result provenance, application state, protected artifacts, and source-backed claims. Replacing that with TrueForge's separate chat/session store would risk losing those guarantees and the strict Partiful UI design. Instead, `trueforge.consult` is another explicitly bounded read tool available to Igor's existing model-directed agent when enabled.

- One persisted TrueForge session ID per Igor `Task`; follow-up consultations reuse it.
- TrueForge handles the delegated subagent turn and returns text through official `POST /api/v1/sessions/{id}/turns` SSE streaming. First call creates a session with `POST /api/v1/sessions`.
- Igor records the delegated output as **UNVERIFIED working context** (not Qloo evidence, a real booking, citation, user approval, or saved authored artifact). Its own tools still need to verify sources independently.
- Existing engine limits, versioned saves, isolated working copies, Qloo results and artifact approvals stay intact.
- If a provider call stalls, errors, requests approval, returns no terminal event, or exceeds limits, Igor's agent receives a failed tool result and does **not** commit a new TrueForge session ID.
- The interface is unchanged. No new branches or PRs; builds remain on `feat/partiful-codrops-unified-20261029`.

## Enable behind an existing TrueForge server

TrueForge server prerequisites (separate process/service, **not automatically started by Igor**):
1. Run the TrueForge harness on a secure localhost port for development or an HTTPS endpoint with authentication for hosted use.
2. Configure an agent in TrueForge named `igor-delegate` with a model and only the tools you are prepared to authorize. Do not expose a no-login local TrueForge server on the public internet.
3. Configure the **server-side** Igor environment:

```env
IGOR_TRUEFORGE_ENABLED=1
TRUEFORGE_BASE_URL=http://127.0.0.1:8790
TRUEFORGE_AGENT_NAME=igor-delegate
# TRUEFORGE_TOKEN=...          # required when TRUEFORGE_BASE_URL is remote HTTPS
```

The adapter rejects non-HTTPS remote bases, embedded URL credentials, path/query fragments, unsupported agent names, and malformed session IDs. No TrueForge credentials or URLs are supplied through the model or browser. Disabled-by-default in CI and production until configured.

## Correctness and security boundaries

1. Delegated text is **not evidence**: never label it Qloo LIVE/CACHED, create cultural affinities, or present a TrueForge guess as a verified fact.
2. The working task clone preserves version-conflict and late-tool timeout safeguards. `trueforgeSessionId` is persisted only after a completed successful turn.
3. The tool consumes bounded SSE event frames, only aggregates main-thread deltas and requires a terminal `turn.done` status `done` without pending approval. It refuses to silently approve external tools.
4. A deployment of TrueForge requires its own configured model provider and server authentication. This integration intentionally does not provision services or copy secrets.
5. All delegated inputs are sent to the configured TrueForge service; only enable this when it is trusted for those task details.
6. This is **not** a proven improvement in multi-turn task quality until a real-service A/B evaluation (same Qloo recordings, cost, latency, fidelity, failure handling) demonstrates it.

## Acceptance test plan

- `tests/unit/trueforge.test.ts`: config validation, session creation/resumption, official HTTP paths, streamed terminal events, approval/failure boundaries and main-thread filtering.
- Existing source-backed Qloo and work-canvas regressions must continue passing in `qloo-test`.
- Live acceptance remains unverified: run real TrueForge server with an authorized model and `IGOR_TRUEFORGE_ENABLED=1`, then compare the same multi-turn task against Igor's built-in tools (tool calls, sources, cost, saved work, resumption).
- **No deployment changes**. Do not claim real TrueForge or production inference passed when tests only use a mocked harness.
