# Live integration

The deployed Railway application has passed the conversational discovery and budget-revision checks below with its configured Gemini and Qloo adapters. Historical standalone provider checks remain in [provider validation](github-validation.md). These checks establish two film-discovery journeys, not every supported outcome or human relevance.

1. Configure `QLOO_API_KEY` and `GEMINI_API_KEY` in the server environment of an approved private runtime. Tested model: `GEMINI_MODEL=gemini-3.5-flash-lite`. Never use a `NEXT_PUBLIC_` secret. The optional OpenAI configuration remains supported.
2. Confirm quota and model availability for that environment. Runtime caps Qloo requests at 30 per turn and model requests at six per provider instance; no automatic transport retry; at most one bounded decision-format repair. Fixed-host Gemini calls time out after 75 seconds and reject unrecognized results.
3. Run a fresh task, explicitly resolve the sample Moonlight ambiguity, inspect LIVE evidence and per-person queries, supply real planning facts, complete a programme and verify corrections. Unknown prices, segment lengths and access must remain unknown until supplied or verified.
4. Run the in-app same-pool comparison. The saved Actions comparison is independent evidence, not an imported result falsely labelled as a local model invocation. Assess preference quality with target users before claiming incremental user value.
5. Warm judging examples with genuine responses, retain original timestamps and use cache-only mode. The bundled `IGOR_QLOO_RECORDING=tests/fixtures/qloo-cultural.json.gz` already supports credential-free CACHED replay; uncaptured requests block and records expire after 30 days.

No additional service account, database, deployment or paid resource is required for the local recorded-data workflow. Frontend redesign remains deferred. No invitation is sent and nothing is booked by the application.

Primary references: https://github.com/qloo/docs-public/blob/main/reference/get-search.md ; https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md ; https://github.com/qloo/docs-public/blob/main/docs/interpreting-affinity-scores.md ; https://ai.google.dev/api/generate-content ; https://ai.google.dev/api/models ; https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures . Runtime evidence, not documentation alone, established the observed contracts.

## Production conversation probe, 26 October 2026

The Railway service accepted a fresh task and reported live-provider mode with a tool-calling model. A single natural request, "I like Radiohead and Arrival. Find films for me for a quiet evening.", returned clarification about mixing document wording and planning corrections, retained six demo participants and returned no candidates. This is a failed production conversation check, not evidence of successful live discovery.

The engine follow-up adds grounded profile creation, conversation history in model context, explicit instructions against unsolicited document edits and state-derived turn replies. Regression coverage uses controlled model/provider responses. The same request was repeated successfully after integration; see the release checks below.

## Railway release checks, 26 October 2026

Engine revision `daacd11f4d0cabaa36473d93d7554aaa477ca51e` was deployed successfully to https://igor-production-243e.up.railway.app/. The first merged version exposed a Gemini HTTP 400 failure before retrieval. Gemini now receives the branching action list as a JSON-encoded string; Igor decodes it and applies the same complete action schema, bounds and grounding rules. Unknown operations and oversized batches remain rejected. Sanitized failure categories retain no raw model responses or credentials.

| Operator-supplied test request                                          | Observed result                                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "I like Radiohead and Arrival. Find films for me for a quiet evening."  | One real profile, no demo people, ten film references, cached Qloo evidence, one model request     |
| "I like Portishead and Arrival. Find films for me for a quiet evening." | One real profile, ten film references, LIVE Qloo evidence, two Qloo requests and one model request |
| "Budget: 20" after each request                                         | Budget updated to 20, catalogue preserved, zero Qloo requests, one model request                   |
| Structured Radiohead/Arrival profile                                    | Thirty film, TV and artist references, LIVE Qloo evidence, three Qloo requests                     |

Examples returned included Children of Men, Moon and Ex Machina. The results remained cultural references: no prices, durations or availability were invented, and no feasibility, booking or preference-quality claim was established. Test profiles were not saved to persistent memory. The structured path is separate evidence from the natural conversation checks.

Latest local validation passed 181 tests across 18 suites, ten browser checks for home/workspace/provider boundaries, formatting, type checking, lint and production build. Six suites requiring the compressed cultural recording were excluded because that large binary could not be restored through the connector after workspace maintenance. GitHub Actions failed before runner assignment and ran no verification steps. Full recorded-data regression coverage remains pending for this release; earlier successful runs are historical evidence, not a substitute for that check.

## Conversation and thread-context release, 26 October 2026

Revision `ffd5c6b4cf1dc75f3b2b0eca782bf43fc0295c4b` replaces production greeting matching with model decisions for conversation, clarification, goals and revisions. Conversational replies preserve planning state. Thread context includes saved history and current evidence rather than only the last eight messages; long histories are bounded with explicit omissions.

A fresh operator-controlled Railway conversation completed seven discussion turns without errors or cultural requests. The first turn supplied an anniversary occasion and a quiet, unhurried mood. After five intervening exchanges, the model replied: "This is for your anniversary, and you said you wanted the mood to be quiet and unhurried." All fourteen discussion messages were restored by the task API.

The same thread then accepted a Portishead/Arrival film request and returned ten references using cached Qloo evidence. A further question about the first film produced a conversational explanation with an existing evidence reference and no cultural requests. The nine-turn thread retained eighteen messages. This verifies conversational continuity and reference scoping; the semantic quality of every recommendation or explanation has not been independently established.

A separate live browser check discussed options, refreshed the page, restored the reply, and correctly answered "Remind me what I just asked." No error alerts appeared. An owner-scoped task created before deployment remained accessible after deployment. These checks use synthetic test conversations, not the user's personal preferences or private messages.

Local checks passed 195 tests across twenty available suites, eleven browser checks, formatting, types, lint and build. The six recording-dependent suites and the blocked Actions runner remain outside this latest validation scope.

## Workspace context check, 26 October 2026

Engine commit `c7ef059e5aa7189b53686bb6c066c59f7a19bdfc` was deployed successfully on Railway. A fresh workspace had no illustrative participants. The exact message `planning a weekend trip with friends` received a useful follow-up; the browser restored the conversation after reload and recalled the request in a later reply. Desktop and mobile checks found no nonempty error alert or horizontal overflow.

A separate live-runtime thread supplied shared Radiohead and Arrival preferences, returned film references and applied a $25 budget correction while retaining the reference pool. The opening used two cultural requests; its insight evidence was cached Qloo data. The correction used zero cultural requests. This verifies one application walkthrough, not fresh live insights or human recommendation quality. A later repetition asked an unnecessary style question and returned no references before the next correction. Immediate retrieval for this prompt is not consistent yet.

The broader check first found that repeating unchanged budget/time defaults could reject an otherwise grounded preference update. Unchanged constraints now produce no edits; new values still require explicit grounding. Fresh workspaces and explicitly selected examples use separate constructors. The readable transcript retains earlier source references and shows their current freshness.

Local checks passed 203 tests across 22 suites, 11 browser checks, formatting, types, lint and production build. A complete test attempt remained blocked by the missing local `qloo-cultural.json.gz` recording. That recording remains in the remote tree; it was not replaced with synthetic data. The full product acceptance brief remains unfinished.
