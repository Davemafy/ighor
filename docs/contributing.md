# Contributing

Use Node 24 or later. Run `npm ci`, then `npm run dev:recorded` for a demo without credentials.

## Before a commit

Run `npm run format` and `npm run verify:all`. For quicker feedback while editing, use `npm test`, `npm run typecheck` or `npm run lint`.

Browser tests start their own servers. Stop other Next.js processes before building or testing. A new machine needs `npx playwright install chromium`.

## Code style

Use descriptive names and one variable declaration per statement. Leave space between functions and logical steps. Add braces to control flow, including short branches. ESLint and Prettier enforce these conventions.

Keep functions and components focused on one responsibility. Extract code when it has a useful name and a clear purpose. Comments should explain a constraint, assumption or trade-off that the code alone cannot show.

Write documentation in plain language. Describe what works, how to run it and any known limits. Keep delivery updates and generated reports out of setup instructions. Use ordinary punctuation rather than long dashes in authored prose.

## Where code belongs

The [README](../README.md#find-your-way) maps the folders. Pages and API routes belong in `src/app/`; provider calls and eligibility decisions stay on the server. Unit and integration tests live in `tests/unit/`, and browser journeys in `tests/browser/`. Both test configurations live under `tests/`.

Validate model proposals through runtime schemas. A provider association cannot establish a price, availability or user preference. When changing revision rules, check that affected outputs become stale, unrelated work survives and late results cannot overwrite a newer turn.

Label synthetic fixtures, archived responses and live results accurately. Keep imported research and captured provider payloads unchanged so their hashes remain verifiable.

## Local files

Never commit credentials, `.igor/` databases, review content or generated build output. Put generated reports in `artifacts/` or `test-results/`. `.next/`, `next-env.d.ts` and Next.js-generated agent guidance are local files ignored by Git.

See [development setup](development.md) for provider configuration and [architecture](architecture.md) for task ownership and evidence rules.

## Engineering standards

These apply to new work and refactors. Review them alongside the automated checks.

- Keep each module focused on a domain responsibility. Avoid catch-all utilities and abstractions with only speculative uses. File length alone is not a reason to split coherent schemas.
- Make the main flow readable as named operations. Separate request handling, state transitions, provider I/O and rendering. Pass dependencies explicitly.
- Prefer early returns to deep nesting. Use descriptive domain names. Avoid single-letter names outside short indices and simple comparators.
- Derive types from validated schemas. Use `unknown` at external boundaries; validate before use. Do not use `any`, double assertions or non-null assertions to bypass missing validation.
- Keep comments focused on invariants and trade-offs. Documentation must describe implemented behavior in plain language. Do not add promotional claims, delivery transcripts or decorative punctuation.
- Keep provider credentials on the server. Bound requests, response sizes and waiting time. Surface failures; do not silently substitute invented results.
- Preserve task ownership, optimistic version checks and atomic corrections. Review proposals require owner acceptance. External actions require explicit user intent.
- Keep LIVE, CACHED, user-supplied and synthetic evidence distinct. An affinity does not establish practical facts or user satisfaction.
- Test changed behavior and meaningful failure cases. Preserve regression coverage. Do not add tests merely to increase the count or weaken assertions to obtain a pass.
- Keep the root conventional. Test data belongs in `tests/fixtures/`; generated evidence stays ignored. Add dependencies only for a demonstrated need.

## Definition of done

A change is ready when another developer can locate it, understand its inputs and effects, run it from the documented setup and inspect its evidence.

Before pushing, review the diff for unrelated changes, secrets, generated files, duplicated logic and misleading claims. Run `npm run verify:all`. For documentation-only edits, formatting and link checks are sufficient. Record the checks actually executed; distinguish local tests, recorded replay and live provider runs.

ESLint and Prettier enforce formatting, braces, separate declarations and statement spacing. TypeScript and runtime schemas check different boundaries. Architecture, naming, evidence quality and usefulness still require review; passing checks alone does not establish them.

Keep application source in the private Igor repository. Use qloo-test only for standalone provider harnesses within the authorized call budget. Do not copy private application code or runtime data there.
