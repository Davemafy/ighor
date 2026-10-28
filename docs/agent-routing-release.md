# General-purpose conversation routing — implementation slice

## Why this change

The previously deployed conversation path used a compact route only for the
first Gemini message. An ordinary follow-up then required the entire
`update_brief` schema, regardless of whether the user wanted to say hello,
switch topics, ask a knowledge question, or perform meaningful work.
Grok also had no equivalent low-cost route.

## What executes

1. Every natural message passes through a bounded, **read-only**
   `route_conversation` function call (Gemini, Grok or OpenAI).
2. The route receives compact, task-local conversation history, brief state,
   existing work summaries and evidence identifiers. No model-side
   conversation storage is required.
3. `conversation` and `clarification` return directly and commit a normal
   versioned turn to the SQLite task store. They cannot supply work actions,
   external tool calls, Qloo IDs or edits.
4. `delegate` transfers control to Igor's existing validated
   `update_brief` interpreter, grounding rules, execution budgets, and state
   version checks. This includes corrections, creation, cultural discovery
   and any request requiring external tools.
5. A standalone current-information request may take a read-only `research`
   route: one Bright Data SERP request (parsed Google organic results) and up to
   two optional Web Unlocker page reads, followed by a source-ID-validated model
   synthesis. It preserves evidence, links and timestamps in the SQLite task.
   Research first saves a `running` checkpoint containing the user's message
   and advances its optimistic version before any external request. The final
   result advances the version again; an intervening correction rejects that
   stale result instead of allowing an overwrite. A successful read-only answer
   preserves the readiness of earlier completed cultural work, including
   when optional research fails. The store's read adapter marks a research
   checkpoint older than two minutes as interrupted and recoverable, without
   racing a possibly in-flight final write or removing the saved user message.
   The real Igor chat displays clickable public source URLs and labels search
   snippets separately from retrieved pages.
6. A malformed route is delegated once (without committing anything).
   Transport failures are not repeated as planning requests. A configured
   backup may retry only this read-only routing decision on transient failure.

## Provider configuration and limits

The current configuration precedence is unchanged:

- `GEMINI_API_KEY`, optionally `GEMINI_MODEL`: primary when present.
- `XAI_API_KEY` or `GROK_API_KEY`, optionally `XAI_MODEL`/`GROK_MODEL`:
  Grok provider and preferred backup when Gemini is configured.
- `LLM_API_KEY` and `LLM_MODEL`: existing OpenAI-compatible fallback.
- `QLOO_API_KEY`: existing cultural provider. No Qloo request is made for a
  conversational response.
- `BRIGHTDATA_API_KEY` + `BRIGHTDATA_SERP_ZONE`: required for real public-web
  search. Without both, research is blocked rather than simulated.
- `BRIGHTDATA_UNLOCKER_ZONE`: optional but strongly recommended to open the
  first two retrieved pages. Without it, the result is explicitly partial
  and limited to search snippets.

The Bright Data adapter sends the documented Bearer-authenticated
`POST https://api.brightdata.com/request` using a Google URL with
`brd_json=1`, then optionally retrieves public HTTPS pages with
`data_format: "markdown"`. The source contract is Bright Data's official
SERP API and Web Unlocker guidance in its public `brightdata/skills` repository.
Only parsed organic results are eligible for page reads; internal/loopback
addresses and non-HTTPS links are rejected. All returned page text is
untrusted and must never be treated as an instruction.

Store keys only in Railway's server-side variables or another trusted secret
manager. The router does not log provider response bodies or keys. Its own
provider request deadline is 14 seconds, its typed response has a 6,000
character maximum, and provider call budgets still apply. The full planner
is invoked only when necessary, at an additional provider-call cost.

Research requires at most **three Bright Data requests per turn** (one SERP
query plus at most two parallel document reads), with a 12-second request
deadline and bounded response size. Synthesis is a separate model call.
Search snapshots are labelled as provider-returned, not independently
verified factual claims. The provider does not perform bookings, writes,
web form submissions, or purchases.

No new provider permissions, browser automation privileges, or write
capabilities are introduced. The existing `runTurn` optimistic version
check remains the authority for committed state.

## Verification and limitations

Tests added for 50 deterministic conversational turns with SQLite reloads,
unrelated-goal preservation, delegation, a failed read-only route, transient
backup, and Gemini/Grok request contracts. Research tests cover safe URLs,
bounded real-provider request contracts, partial source retrieval,
source-linked replies, inline citation enforcement, interrupted-turn
checkpoints and stale-load recovery, stale-result optimistic conflicts,
prior-work readiness and persisted receipts.
These tests use mocked provider responses, not real Bright Data/Qloo calls
or proof of live model quality. The 50-turn test is not a concurrent-load test.

This slice **does not** implement Browserbase, Google Maps, MCP actions,
voice, consequential-tool approvals or fully iterative agent tool selection.
It does not demonstrate the complete general-purpose agent acceptance
scenario. The search provider's live access is unverified in this
execution environment.

The existing GitHub Actions Verify workflow is failing within seconds
on both this branch and `main`. The inspected failed Verify job
(`40586171580`) had an empty `steps` array, `runner_id=0` and no
assigned runner name; the workflow never reached `actions/checkout`.
This strongly indicates a GitHub Actions runner allocation/authorization
problem rather than a recorded test assertion failure, but the root
cause requires checking GitHub's run-page diagnostic banner and the
repository/account Actions and billing settings. Do not assume the reason
is billing or modify the workflow to hide a failing gate.
This does not establish whether the new code passes typecheck or tests.
No live-provider secret was accessed and no deployment was attempted.

Before enabling a production release, run the full repository CI,
live provider smoke tests using authorized credentials, unscripted
multi-turn conversations with real models, Qloo comparisons, and a browser
reload/recovery journey. Record these separately; do not infer live success
from fixture tests.

## Rollback

This branch introduces no database migration. Bright Data environment
variables are optional new server-side configuration; without them, Igor
blocks live research and preserves existing work. To roll back before
merge, close the PR and leave `main` unchanged. After a permitted merge, revert the PR's commits and redeploy
the previously verified SHA through the normal deployment process.
Never deploy or merge without owner authorization.

## Browser entrypoint invariant

Next.js `next.config.ts` rewrites the marketing root `/` to
`/marketing/index.html` **before files are resolved**. The real conversational
agent is mounted at `/app`; the historical `/workspace` route redirects to
`/app`. Browser tests for chat, state reload, evidence/source disclosures, and
mobile interaction must target `/app`. The marketing root is a separate
surface and needs its own distinct smoke test. A passing marketing-heading
assertion does not establish that the agent composer rendered.

## Live short-followup failure and read-only recovery

The deployed branch surfaced a real `model.interpret.error` after the
clarification sequence “New York” → “dining, monopoly”. The screenshot proves
a reply failed, **not** which HTTP status or provider response caused it.
Production provider logs or the saved sanitized trace are needed to assign
that specific upstream cause.

The agent now keeps clarification answers in the lightweight conversation
route when no saved-work mutation or real tool call is required. If the
lightweight route itself returns malformed JSON/schema, one invocation of the
existing full interpreter may recover. If the larger planner rejects its
decision/schema, one bounded **read-only** conversation recovery may respond
without claiming to have used Qloo, searched the web, made bookings, or updated
saved documents. These branches never replay external mutations. Nontransient
authentication errors, rate limits and provider outages are not retried
indiscriminately; they produce categorized, non-secret errors and retain
the user message and prior work.

The diagnostic is persisted as `model.interpret.error`,
`model.route.recovered`, or `model.interpret.recovered` in the task trace.
No upstream raw body or credentials are written. To identify the production
failure, inspect the latest sanitized trace entry for the affected owned task
and the Railway HTTP status; do not copy upstream API payloads or secrets.

A retry of the latest saved `model.interpret.error` turn now detects the matching persisted user message and processes it **without appending a duplicate**. A different message or unrelated failure still starts a normal new turn.

The regression `tests/unit/live-followup-recovery.test.ts` uses the actual
Gemini adapter with offline transport responses for this exact conversation
shape. It is a **provider-schema and persistence simulation**, not evidence
that an actual Railway/Gemini/Qloo call passed. Updating the PR branch
does not change a deployed Railway service; deploy only after explicit
owner approval and release gate review.

## Action-first local discovery: no more intake loops after sufficient context

A real deployed user journey supplied a New York locality, $50 budget,
five friends, Saturday, and "dinning, monopoly", but Igor repeatedly
asked for borough/game-cafe preferences and later claimed to have a plan
without displaying one. This was caused by a read-only conversational
router returning before the execution tools ran.

The local planning path now distinguishes **missing essentials** from
optional preferences. After the thread contains a planning intention,
user-supplied locality and interest answer, the engine overrides a
conversational/clarifying answer with an actual bounded research turn.
"Show me", "where" and "go" resolve to that existing context; unrelated
greetings or discussions stay conversational. The research turn checkpoints
the user's message before execution and retains optimistic version checks.

Provider execution, where configured, includes:

- **Bright Data** SERP and page source inspection (existing bounded search).
  URLs and fetched excerpts are untrusted data and do not prove opening
  hours, pricing, group capacity or reservation availability.
- **Qloo locality/category discovery**, now supported without inventing a
  film/artist preference seed. The query uses `filter.type=urn:entity:place`,
  the explicitly provided `filter.location.query`, a radius of zero, and a
  restaurant-category tag for dining interests. It accepts rows only when
  Qloo's response confirms one matching locality. This is **not personalized
  affinity** and does not establish Monopoly or any other game inventory.
- The results are saved as a new **editable research-report artifact** with
  provider-returned evidence IDs and direct public source URLs. Older
  manually edited or locked work is preserved. The combined Qloo/Bright Data
  activity is visible in the execution trace and receipts. Either provider
  can fail without fabricating results from the other.

The experience must not say "here's your plan" without a rendered result,
invent a venue to satisfy a UI component, or confirm a booking without an
authorized booking integration. Browsing and Qloo place retrieval are
informational, not a purchase/reservation action.

### Production configuration and remaining acceptance

Environment variable names used by the runtime are
`GEMINI_API_KEY` (or `XAI_API_KEY` / `LLM_API_KEY` with model),
`QLOO_API_KEY`, `QLOO_MAX_CALLS` (must be positive to permit live
requests), `BRIGHTDATA_API_KEY`, `BRIGHTDATA_SERP_ZONE`, and optionally
`BRIGHTDATA_UNLOCKER_ZONE`. These names are documentation only; do not
log, copy or commit their values. Qloo's category/location API filter and
the real Bright Data account must still be validated against the actual
Railway deployment. A blocked provider must be called out and not shown as
a successful execution.

Regression tests:
`tests/unit/action-first-planning.test.ts` and
`tests/unit/qloo-practical-exploration.test.ts`. They use provider
transport simulations, not paid live API calls. Existing route persistence,
source constraints, concurrency and eleven Chromium browser journeys remain
part of the non-negotiable release gate.

## October 28 — bounded model-driven research agent

The web-research path now supports an actual **observe → decide → execute →
observe → respond** cycle rather than only a predefined search-then-summarize
sequence. After initial search results, the configured model may use
`choose_research_step` to choose one of:

- `search`: one new, bounded public SERP query through Bright Data.
- `read`: request a page for an **exact source ID already returned by search**
  (only when Web Unlocker is configured). The model cannot pass an arbitrary URL.
- `finish`: stop requesting tools and synthesize from observed sources.

At most **two** model-directed continuation steps execute per user turn, with
eight total external research requests at most, per-step deadlines, source URL
validation, repeated-query rejection and evidence-linked traces. The original
user turn is checkpointed before external calls, and results are saved through
the existing optimistic version check. Late results cannot overwrite a newer
correction. Model choice is only advisory: server code validates the action.
Only the existing engine can mutate tasks; bookings, messages, purchases and
external writes remain unsupported.

The initial search remains a preplanned retrieval; the **continuation** is
model-directed. Qloo locality retrieval is an existing parallel, bounded
provider call rather than a general-purpose tool selected by this loop.
The existing source-grounded final synthesis validates cited source IDs.
No arbitrary browser operation, recursive long-running job, remote code
execution, MCP registry, consequential-action approval, or autonomous
credential use has been implemented as part of this slice.

Verification consists of simulated HTTP/agent outputs, conversation task
persistence, typecheck, unit and focused browser tests. These **do not**
establish that Railway is serving the branch, that live Qloo/Bright Data/model
calls succeed together, or that actual venue recommendations are relevant.
A credentialed staging acceptance with safe/redacted traces remains mandatory.
