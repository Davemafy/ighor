# Supported outcomes

All outcomes share the existing capability registry, ownership, versioning, evidence and revision rules. The user states a goal in one conversation.

| Request                                 | Implemented output                                                         | Limit                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Plan a gathering for six people         | Film/TV and optional artist segment, group trade-offs, editable invitation | Supplied cost, segment length and access required                                          |
| Discover films, artists or places       | Evidence-linked comparisons, per-person/context signals, place coordinates | Cultural association does not verify practical details                                     |
| Build a three-day itinerary in Tokyo    | Day allocation, eligible stops, total cost/time and supplied transfers     | Total activity budget divided equally across days; no route or opening-window verification |
| Build a playlist                        | Artist-level listening programme and transitions                           | No invented tracks, streaming playlist or commercial rights                                |
| Develop a music direction               | Context-linked artist references, claims and open questions                | No measured restaurant atmosphere or audience preference                                   |
| Create a cultural research report       | Cited association claims, caveats and structured export                    | No external research, current trend detection or audience study                            |
| Create a reference-based creative brief | Editable direction from selected cultural references                       | Application interpretation, not proof of demand                                            |

Collections, editable boards, approved memory, scoped reviews and Markdown/JSON export support these outcomes. Nothing is booked or sent automatically.

## Tests

- `workflow.test.ts`, `capabilities.test.ts`: shared contracts, constraints, attribution and failure recovery.
- `conversation.test.ts`, `recorded-conversation.test.ts`: corrections, grounded actions, recorded model responses and receipts.
- `broader-outcomes.test.ts`: itineraries, listening, research, music direction, unknowns, budget/transfer revisions and forged-output rejection.
- `broader-model.test.ts`: mocked Gemini tool contracts, including malformed proposals.
- `outcomes.test.ts`, `auth.test.ts`: ownership, memory, reviews, snapshots, accounts and optimistic changes.
- `recording-file.test.ts`: fixture hashes and decompression integrity.
- Four Playwright suites exercise the complete product flows, keyboard use, persistence, exports, sharing and responsive layout.

The latest executed checks are in `verification.json`. Application tests establish behavior under supplied inputs; they do not establish user preference or market value.

## Practical limits

The cultural pool is capped at thirty candidates. Itineraries support one to seven days, with at most three automatically selected stops per day. Listening programmes support up to twelve artists. Explicit pins are capped at three and must all fit. Rank-ordered selection is a heuristic, not optimal routing or a satisfaction predictor. Currency is USD. Current prices, opening windows, routes, bookings, tracks and rights need separate integrations.
