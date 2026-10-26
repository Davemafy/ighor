# Remaining live integration prerequisites

The provider APIs have now been exercised in Actions; see [provider validation](github-validation.md). The exact local application has not run with live keys, because Actions secrets are not exportable local credentials.

1. Configure `QLOO_API_KEY` and `GEMINI_API_KEY` in the server environment of an approved private runtime. Tested model: `GEMINI_MODEL=gemini-3.5-flash-lite`. Never use a `NEXT_PUBLIC_` secret. The optional OpenAI configuration remains supported.
2. Confirm quota and model availability for that environment. Runtime caps Qloo requests at 30 per turn and model requests at six per provider instance; no automatic generation retry. Fixed-host Gemini calls time out after 75 seconds and reject unrecognized results.
3. Run a fresh task, explicitly resolve the sample Moonlight ambiguity, inspect LIVE evidence and per-person queries, supply real planning facts, complete a programme and verify corrections. Unknown prices, segment lengths and access must remain unknown until supplied or verified.
4. Run the in-app same-pool comparison. The saved Actions comparison is independent evidence, not an imported result falsely labelled as a local model invocation. Assess preference quality with target users before claiming incremental user value.
5. Warm judging examples with genuine responses, retain original timestamps and use cache-only mode. The bundled `IGOR_QLOO_RECORDING=tests/fixtures/qloo-cultural.json.gz` already supports credential-free CACHED replay; uncaptured requests block and records expire after 30 days.

No additional service account, database, deployment or paid resource is required for the local recorded-data workflow. Frontend redesign remains deferred. No invitation is sent and nothing is booked by the application.

Primary references: https://github.com/qloo/docs-public/blob/main/reference/get-search.md ; https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md ; https://github.com/qloo/docs-public/blob/main/docs/interpreting-affinity-scores.md ; https://ai.google.dev/api/generate-content ; https://ai.google.dev/api/models ; https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures . Runtime evidence, not documentation alone, established the observed contracts.
