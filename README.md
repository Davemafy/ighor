# Igor

Your agent with taste. Discover films, music and places, compare ideas with other people, and turn a conversation into an editable plan.

Igor uses Qloo for cultural connections. Costs, availability and other practical details stay separate, with sources and unknowns visible.

## Start

Install Node 24 or later, then run:

```bash
npm ci
npm run dev
```

Open [localhost:3000/app](http://localhost:3000/app). To enable genuine cultural retrieval, configure `QLOO_API_KEY` server-side, and configure a supported model key for general-purpose conversation. See [development setup](docs/development.md). Without these keys, the app should report unavailable capabilities rather than pretending provider responses are live.

**Public submission boundary:** The original Qloo API response recordings and associated replay fixtures were intentionally removed from the entire public Git history because redistribution rights have not been established. `npm run dev:recorded` and the recording-only replay tests are **not** runnable from this sanitized checkout. We do not ship invented substitutes. Those historical tests remain visible for technical review, while `npm test` selects the independent unit suite and discloses the excluded suites.

This public code is intended for review and authorized live-provider configuration, not a claim that the archived demo or externally hosted experience has already passed live acceptance.

## Find your way

| Folder              | Contents                                               |
| ------------------- | ------------------------------------------------------ |
| `src/app/`          | Pages, API routes and styles                           |
| `src/components/`   | Workspace views and editors                            |
| `src/core/`         | Task contracts, conversations and revision rules       |
| `src/capabilities/` | Discovery, comparison, composition and validation      |
| `src/tools/`        | Provider adapters and response caches                  |
| `src/data/`         | SQLite stores and sample tasks                         |
| `tests/unit/`       | Unit and integration tests                             |
| `tests/browser/`    | Complete browser journeys                              |
| `tests/fixtures/`   | Private recordings excluded from public release        |
| `scripts/`          | Local development and verification commands            |
| `docs/`             | Setup, architecture, supported outcomes and research   |

Start with [the orchestrator](src/core/orchestrator.ts) to follow a turn, or [the workspace](src/components/workspace.tsx) to follow the interface.

## Judge-first release status

The submission candidate is **not verified live**. Source-linked sample recordings are not live Qloo proof. The saved-document view now defaults ahead of raw discovery listings and shows its revision impact from persisted server state. The [judge package](docs/submission/DEVPOST_DRAFT.md) contains a draft entry, [85-second capture plan](docs/submission/JUDGE_FILM.md) and [release gates](docs/submission/RELEASE_GATES.md); no screenshot or live execution is claimed until captured at the exact candidate SHA.

## Check a change

```bash
npm test
npm run verify:all
```

The full check requires formatting, types, lint, the runnable unit suite, a production build and browser tests. In this sanitized version, original recorded-provider suites remain excluded until authorized recordings are supplied privately; a green public-suite result is not a full replay-suite result. Install the browser once with `npx playwright install chromium`. Checks use recorded or synthetic inputs and clear provider credentials.

[Contributing](docs/contributing.md) · [Architecture](docs/architecture.md) · [Demo](docs/demo.md) · [Supported outcomes and limits](docs/broader-outcomes.md)
