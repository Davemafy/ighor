# Igor — Devpost submission draft (not approved for submission)

**Title:** Igor — Your agent, with taste  
**One-liner:** Cultural intelligence that makes something useful — and remembers what you decided.  
**Category:** Agentic application powered by Qloo.  
**Status:** Draft. Live proof, final imagery, capture and owner approval remain mandatory.

## Opening

People don't think in filters. They say things like: “Make a Brooklyn gathering feel like Sade, Radiohead and Wong Kar-wai — for under $3,000.” Igor is a conversational workspace that can turn that unfinished thought into an editable proposal, with Qloo cultural evidence connected to the choices. Change Radiohead to Bad Bunny and Igor is designed to revise the affected direction without forgetting the budget, the other influences or work you already approved. The difference isn't another recommendation list. It's a result you can keep working on.

_Publication gate: the paragraph above describes the implemented workflow and intended product behavior. Do not present it as a successful live demonstration until the real Qloo/model-provider walkthrough passes and the captured result supports every clause._

## Why it matters

Cultural choices shape events, creative briefs, campaigns, travel and everyday decisions, but discovery tools often stop at a list. Igor connects cultural retrieval to reasoning, composition and revision. Its intended user is anyone working from a rough idea; an initial plausible paid segment is independent creative producers and experience planners who repeatedly turn taste references into client-ready materials. This is a business hypothesis, **not** measured market demand or validated revenue.

## What we built

- **Conversation-first agent:** bounded checkpointed execution loop coordinating cultural discovery, research and editable work rather than requiring Qloo API knowledge.
- **Source-first cultural decisions:** Qloo signals retain candidate/query/seed provenance, LIVE/CACHED delivery, retrieval information and limitations. Affinity does not establish licensing, prices, access or availability.
- **Connected work:** durable editable documents, approvals, budget constraints, decisions and version history persisted with the conversation.
- **Selective revision:** corrections target dependent decisions; approved independent material remains protected, with conflicts and missing evidence visible.
- **Inspectable outcome:** the work surface now prioritizes saved documents and its version ledger shows genuine text changes, approved material, budget and outstanding checks.

## Technical implementation

Next.js 16, React 19, TypeScript 6, SQLite-backed task state, bounded model-directed tool loop, Qloo cultural retrieval, supported non-OpenAI model adapters, provider boundaries and Playwright/Vitest verification. Requests have explicit limits. Provider failures should retain working state rather than fabricate answers. Qloo retrieval/source linkage demonstrates integration, **not by itself measured user impact**.

**Evidence to attach before submitting:** exact release SHA; Qloo query/result receipts with timestamps, delivery modes and source IDs; agent request/step summaries; full CI and test outcomes; independently checked practical limitations; unscripted non-flagship conversation; and reload identity for the revised proposal.

## Demo — 85 seconds

**85-second real browser film: NOT YET CAPTURED.** Film plan and evidence gates: JUDGE_FILM.md.

## Three screenshots (all must be real captures)

1. **A result worth keeping.** Actual saved Brooklyn proposal, readable title, editable content and budget. _Pending live capture._
2. **Why this direction.** Actual Qloo cultural results with delivery labels and inspectable sources; practical unknowns separate. _Pending live capture._
3. **Change only what changed.** Bad Bunny revision, true before/after document text, retained $3,000 constraint and approved independent access requirement, captured after reload. _Pending live capture._

Existing docs/evidence/one-chat images are genuine **SAMPLE** UI evidence, not substitutes for these three flagship screenshots.

## Business model and potential impact

Start with a free personal workspace for discovery and planning. Test a paid tier for producers and small teams needing repeatable cultural briefs, client revision history, approvals and exports. Long-term value should come from demonstrably better and faster decisions, not from a claim that Qloo ranking automatically improves outcomes. No adoption, revenue or experimental lift is claimed.

## Safety and limitations

Provider affinity does not guarantee relevance, venue feasibility, copyright permission, physical access or availability. Igor separates saved user facts, creative proposals, cached source results and unresolved checks. Public release requires server-managed credentials, request ceilings, owner isolation and licensing review.

## Demo access and setup

Hosted judge access must be safely rate limited, must not ask judges for their own API keys and must show accurate fallback behavior. Operators install authorized providers server-side and verify real delivery. Node 24+, npm ci and npm run dev:recorded provide the local archived demonstration; private live setup is documented in docs/development.md. Full check: npm run verify:all.

**Do not submit** without release gates in RELEASE_GATES.md and explicit owner approval.
