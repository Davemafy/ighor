# Local development

## Runtime

Node 24+ provides `node:sqlite`. Install the lockfile dependencies with `npm ci`.

| Command                       | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `npm run dev:recorded`        | Credential-free demo using archived provider responses           |
| `npm run dev`                 | Development server; live access requires server credentials      |
| `npm run build` / `npm start` | Production build and local production server                     |
| `npm run verify`              | Format, types, lint, unit/integration tests and production build |
| `npm run test:browser`        | All browser suites against the production build                  |
| `npm run verify:all`          | Both verification commands in order                              |

The recorded demo does not query providers. Uncaptured requests block; original retrieval times and CACHED labels remain visible. The deterministic interpreter supports documented goal/correction forms. The bundled sample Moonlight seed is ambiguous; choose the 2016 identity before continuing.

## Server configuration

Configure credentials only in the server environment. No public client variable is needed.

| Variable                         | Purpose                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `QLOO_API_KEY`                   | Fixed-origin Qloo access                                                         |
| `QLOO_MAX_CALLS`                 | Network requests per turn; default/hard ceiling 30; zero disables uncached calls |
| `QLOO_CACHE_DAYS`                | Cache lifetime; default one day, maximum thirty                                  |
| `QLOO_CACHE_ONLY=1`              | Block cache misses instead of querying                                           |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini access; recorded model is `gemini-3.5-flash-lite`                         |
| `LLM_API_KEY`, `LLM_MODEL`       | Optional OpenAI Responses adapter with explicit model ID                         |
| `IGOR_QLOO_RECORDING`            | Local provider recording path                                                    |
| `IGOR_DB_PATH`                   | Task database; default `.igor/workspace.sqlite`                                  |
| `IGOR_CACHE_PATH`                | Qloo response cache; default `.igor/qloo-cache.sqlite`                           |
| `IGOR_AUTH_PATH`                 | Local account database; default `.igor/auth.sqlite`                              |
| `IGOR_OUTCOMES_PATH`             | Collections/reviews database; default `.igor/outcomes.sqlite`                    |

Gemini takes precedence when both model adapters are configured. Without a model key, the development interpreter proposes the same validated actions. Normal interpretation uses one model call; same-pool comparison uses four. The model adapter caps execution at six calls and 1,200 output tokens per call, without automatic retries.

Live transport for this exact private runtime still needs verification. Actions secrets are not local credentials. See [live integration prerequisites](live-integration.md) and [provider validation](github-validation.md).

## Local state

Use the same hostname throughout a session. The HttpOnly cookie owns anonymous work; a registered local account can restore its own tasks. Login does not merge another anonymous session. There is no email recovery or verified identity provider.

SQLite uses WAL files. Stop the server before copying or resetting databases. Back up the private task, account and outcome databases together. Do not include them in source archives. A deployment needs persistent Node storage, TLS, backups and recovery checks; an ephemeral filesystem is unsuitable for durable local accounts.

## Browser suites

`npm run test:browser` (or `npm run test:e2e`) runs all fifteen cases through one `tests/playwright.config.mts`. Its four named projects share the same production build and use isolated provider-mode databases. Provider credentials are cleared in the server configuration, including direct Playwright invocations.

After `npm run build`, select a project with:

```bash
npm run test:browser -- --project=workspace
npm run test:browser -- --project=provider-boundary
npm run test:browser -- --project=continuity
npm run test:browser -- --project=broader-outcomes
```

Do not run a build and a browser server against the same `.next` directory simultaneously. `.next/` and `next-env.d.ts` are generated locally and ignored by Git. `npm run typecheck` invokes `next typegen` first, so a fresh clone does not need generated declarations committed.

HTTP acceptance scripts target localhost on port 3300. Start a recorded-data production server with live model keys unset, then run `node scripts/conversation-acceptance.mjs` and `node scripts/reference-acceptance.mjs`. They write actual task snapshots to ignored `artifacts/`; practical facts in those tests are synthetic inputs.

### Grok on Railway

Set `XAI_API_KEY` (or `GROK_API_KEY`). Optionally set `XAI_MODEL` (or `GROK_MODEL`); the default is `grok-4.3`. If Gemini is configured, Grok is its interpretation backup. Otherwise Grok is the primary model. Existing OpenAI settings are only used when no Grok key is configured. Keys remain server-side.

The adapter uses the pinned `https://api.x.ai/v1/responses` endpoint, `store: false`, validated application tools, bounded requests and the existing read-only fallback policy. It does not enable provider-hosted web tools or replay cultural calls and writes. Protocol reference: https://docs.x.ai/developers/rest-api-reference/inference/responses.
