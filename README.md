# Igor

Your agent with taste. Discover films, music and places, compare ideas with other people, and turn a conversation into an editable plan.

Igor uses Qloo for cultural connections. Costs, availability and other practical details stay separate, with sources and unknowns visible.

## Start

Install Node 24 or later, then run:

```bash
npm ci
npm run dev:recorded
```

Open [localhost:3000](http://localhost:3000). Try a gathering for six friends, Tokyo discovery or a personal start with Radiohead.

The recorded demo needs no credentials and makes no provider calls. It uses archived Qloo responses and a limited local interpreter. Results retain their retrieval dates and show a cached label. Requests without a recording stop rather than invent a result.

To connect live providers, see [development setup](docs/development.md).

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
| `tests/fixtures/`   | Recorded provider responses used by the demo and tests |
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

The full check includes formatting, types, lint, unit and integration tests, a production build and browser tests. Install the browser once with `npx playwright install chromium`. Checks use recorded or synthetic inputs and clear provider credentials.

[Contributing](docs/contributing.md) · [Architecture](docs/architecture.md) · [Demo](docs/demo.md) · [Supported outcomes and limits](docs/broader-outcomes.md)
