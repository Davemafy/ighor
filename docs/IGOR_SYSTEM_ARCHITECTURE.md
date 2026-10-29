# Igor — system architecture map
**Version:** 2026-10-29 · **Target:** the single Igor development branch · **Authority:** inspected code at commit d4afa937d726385d23ed24e3447ad28eb21a03bb

This document distinguishes **implemented (I)**, **implemented but not proven live (V)**, **proposed (P)**, and **not supported (N)**. It is an executable architecture plan, not a claim that all services are connected or that the listening-bar workflow exists end to end.

## 0. The product invariant

**One goal → one persistent conversation and versioned work graph → relevant verified cultural and practical observations → a coherent editable experience → independent critique → selective revision.**

The engine is **goal-general**. A six-person gathering and a listening-bar concept must use the **same** state, capabilities, evaluation, source, and revision contracts. Neither vertical becomes a new app shell.

## 1. Logical architecture

~~~mermaid
flowchart TB
  U["User • goal / correction / approval"] --> UI["Igor web client · Partiful-aligned · Next.js /app"]
  UI --> API["Authenticated task and outcome APIs"]
  API --> INT["Input validation + owner + optimistic version guard"]
  INT --> ORCH["Igor runTurn orchestrator"]
  ORCH --> ROUTE{"Interpret / route"}
  ROUTE --> CHAT["Respond / clarify / local work edit"]
  ROUTE --> PLAN["Existing capability planner"]
  ROUTE --> AGENT["Existing model-directed tool loop"]
  PLAN --> CAP["Discover · Evaluate · Collaborate · Compose"]
  AGENT --> TOOLS["Validated bounded tool registry"]
  TOOLS --> Q["Qloo: live or cache / recorded"]
  TOOLS --> WEB["Bright Data: search / page read"]
  TOOLS --> MAP["Google Places: verified addresses"]
  TOOLS --> BROWSER["Browserbase: read-only observation"]
  TOOLS --> TF["TrueForge: optional delegated session"]
  AGENT --> CAP
  CAP --> CRIT["Evidence + feasibility + conflict + acceptance checks"]
  CRIT --> REV["Dependency invalidation + artifact protection"]
  CHAT --> SAVE["Atomic versioned task save + SSE updates"]
  REV --> SAVE
  SAVE --> DB["SQLite: tasks, explicit memory, accounts, outcomes"]
  DB --> UI
  CRIT --> UI
  UI --> DOC["Living outputs · invitation / document / cultural selection"]
  DOC --> U
~~~

**Existing runtime flow (I).** Browser work comes through the task routes and the SSE turn route. The orchestrator validates interpretation and routes either to early reply/clarification/local connected-work actions, to an ordered capability plan, or (when a research query exists and the model supports agent tool selection) to the bounded agent loop. The tool registry is **not** a universal replacement for the planner; both execution paths remain in current code. All results must ultimately respect the same saved Task schema.

**Design boundary (I).** No separate TrueForge UI, no new dashboard. Igor's own editor, provenance badges, document, invitation, and discovery views render the work. Refer to **docs/design-system.md**.

## 2. Source code ownership

| Responsibility | Existing implementation | Current truth |
| --- | --- | --- |
| Shell, chat, work area | **src/components/agent-workspace.tsx**, task canvas, research discovery, invitation studio | I |
| Task creation, fetch, turns | **src/app/api/tasks**, **src/app/api/tasks/[id]/turn/route.ts** | I; SSE sends state/action/done/error |
| Identity and security | **src/core/security.ts**, **src/data/auth-store.ts** | I; owner-scoped cookie/account sessions |
| Intent and response | **src/core/interpret-message.ts**, **src/core/orchestrator.ts**, model adapters | I; live-model quality not broadly proven |
| Bounded dynamic agent | **src/core/unified-agent.ts**, **src/core/agent-tool-registry.ts** | I; validated tools, step/request budget and checkpoints |
| Capability execution | **src/core/capability-plan.ts**, **src/core/execute-plan.ts**, **src/capabilities/** | I; discovery/evaluate/collaborate/compose |
| Cultural data | **src/tools/qloo-live.ts**, **qloo-response.ts**, **recorded-qloo.ts**, **qloo-cache.ts** | I; live freshness must be verified |
| Search & real-world data | **src/tools/live-research.ts**, **google-maps.ts**, **browserbase-observer.ts** | I adapters; credentials/provider success unconfirmed |
| Delegation | **src/tools/trueforge.ts** | V; disabled by default, mocked API tests only |
| Contract + critique | **src/core/contracts.ts**, **agent-acceptance.ts**, **src/capabilities/evaluate.ts** | I; compositional experience critique is still incomplete |
| Durable edits and dependencies | **src/core/connected-work.ts**, **connected-artifacts.ts**, **revision.ts** | I; broader cross-domain dependency graph requires expansion |
| Durable task state | **src/data/store.ts** | I; SQLite tasks + explicitly confirmed memory |
| Auth, sharing, collection, review | **src/data/auth-store.ts**, **outcome-store.ts**, **src/core/outcomes.ts** | I; not email/calendar external execution |
| Presentation | **src/components/invitation-studio.tsx**, **liquid-discovery.tsx** | I; current design review contract is Partiful-based |
| Real cross-app write actions | **src/core/connected-work.ts** | N; external actions explicitly record *blocked*, nothing is sent or booked |

## 3. Task state = system of record

The durable unit is a **Task** (owner-scoped), **not** a TrueForge session, a chat completion, or a browser view. Each Task carries:

- **Intent:** goal, participants/preferences, constraints, location, selection and unresolved requirements.
- **Conversation:** user and assistant messages with identities, plus a saved work/presentation surface.
- **Observation:** Qloo entities, cultural candidates, evidence records and per-query provenance; web source observations; practical unknowns.
- **Work:** proposed/approved/rejected decisions and documents; independent artifacts; versions, explicit edits, dependency links and traces.
- **Execution:** current and archived agent runs, tool receipts, budgets, activity and optional delegated TrueForge session ID.

**Single writer rule (I):** every edit supplies an expected task version. The server checks owner and version, checkpoints before slow provider calls, rejects conflicting writes and does not overwrite newer changes with late results. Independent side effects require separate idempotency and user authorization (P).

**Memory distinction:** confirmed preference memory exists (I); a long-lived, proactive assistant with a scheduler and cross-goal follow-up does **not** (N). Resuming a task uses Igor's saved Task, not a provider's conversation as the sole source of truth. The TrueForge session ID is a subordinate execution context.

## 4. Agent's decision and execution loop

~~~mermaid
sequenceDiagram
  participant U as User
  participant UI as Igor UI
  participant API as Task SSE API
  participant O as Orchestrator
  participant M as Reasoning model
  participant T as Tool/capability
  participant DB as Task DB
  U->>UI: Goal or revision
  UI->>API: POST turn + task version
  API->>O: Authenticated, validated turn
  O->>M: Goal + saved context + available tools
  M-->>O: Reply / clarify / task plan / agent action
  alt Clarify or local work
    O->>DB: Save message or edited artifact
  else Research or compose
    O->>DB: Checkpoint running state
    loop Bounded tool actions
      O->>T: Validated tool arguments
      T-->>O: Observation + source IDs or explicit failure
      O->>DB: Save versioned progress
    end
    O->>O: Check source integrity, fit, budget and dependencies
    O->>DB: Commit evidence, decisions and artifacts
  end
  O-->>API: state/action/done events
  API-->>UI: Server-sent events
  UI-->>U: Continuously editable, inspectable result
~~~

**Guardrails already in code:** origin/owner checks, bounded request body, typed decisions, one bounded repair for malformed model output, finite agent actions, no model-chosen URLs for search-page reads, process-local request limits, optimistic versioned persistence, source-aware evidence checks, and protection against rewriting manually edited/approved work.

**Operational gap (P):** add durable run leases/checkpoints to recover safely after container restarts or duplicated requests, correlation IDs, and shared per-owner quota for multi-instance deployment. Do not treat process-local caps as globally enforced.

## 5. The composition layer we must complete

Gastro-Acoustic must be a **reusable experience graph** layered over existing connected work, not a one-off prompt template.

~~~mermaid
flowchart LR
  AUD["Audience and goal"] --> TASTE["Taste constraints"]
  TASTE --> MUSIC["Music direction"]
  MUSIC --> ATM["Atmosphere / sound behavior"]
  TASTE --> FOOD["Food / drink direction"]
  FOOD --> ATM
  ATM --> SPACE["Space and occasion"]
  SPACE --> COST["Budget / access / feasibility"]
  COST --> REVIEW{"Fit and critique"}
  REVIEW -->|fail / unknown| REV["Revise affected nodes"]
  REV --> MUSIC
  REV --> FOOD
  REVIEW -->|pass with sourced caveats| OUTPUT["Versioned experience brief + invitation"]
~~~

**Proposed experience records (P):**
- **ExperienceGoal:** audience, use case, intent, known and unknown constraints.
- **DecisionNode:** domain = music | food | atmosphere | space | identity | operations; chosen value; alternatives; justification; confidence; estimated cost or unknown; approval state.
- **EvidenceLink:** immutable provider/candidate/source references with original timestamps, delivery mode, limitations and whether evidence is cultural versus practical.
- **DependencyEdge:** which decisions and authored sections must become *stale* when a constraint changes.
- **ExperienceArtifact:** editable launch brief, timeline, invitation, shortlist, menu/sound direction and explicit unresolved questions.

**Boundary rule:** Qloo affinities support a *cultural* connection, never venue availability, dietary suitability, actual acoustical performance, price, a booking, or a personal psychological claim. The model may propose a coherent pairing but should mark unsupported parts as interpretation. Critique must independently reject missing or contradictory inputs instead of praising everything.

**Gap:** Igor has general-purpose work decisions, budget conflicts, evaluator and stale-dependency machinery. It does **not yet** have a fully implemented typed music ↔ food ↔ atmosphere experience graph nor a demonstrated independent cross-domain critique loop (P).

## 6. Proposed hosting topology — minimum credible production

~~~mermaid
flowchart TB
  USER["Browser"] -->|HTTPS| R["Railway: Igor Next.js Node 24 API + web"]
  R --> VOL[("Railway persistent volume: SQLite WAL files")]
  R --> QLOO["Qloo API"]
  R --> LLM["Primary model + optional fallback"]
  R --> BRIGHT["Bright Data SERP/page reader"]
  R --> PLACES["Google Places API"]
  R --> BROWSER["Optional Browserbase observation"]
  R -->|HTTPS authenticated, opt-in| TF["Optional separate TrueForge service"]
  TF --> TFDB[("TrueForge hosted persistence: Postgres / Redis")]
  CI["qloo-test CI runner"] -.->|read exact Igor commit| REPO["Igor active development branch"]
  CI -.-> PROOF["Unit + build + browser evidence"]
~~~

**P0 hosting topology:** one Igor Node 24 app instance, TLS and a Railway persistent volume containing **the workspace, account, outcome and Qloo cache SQLite files together**, with scheduled backups **including WAL** and a tested restore. Mount before any real user data is collected. Verify actual volume and backup configuration; the presence of SQLite in code does not establish that the deployed Railway app is durable. If multiple replicas are required later, migrate to a shared database and shared quotas first—do not share SQLite WAL across multiple containers.

**P0 keys:** server-only QLOO_API_KEY and one model credential plus optional fallback. For sourced practical-world lookup, BRIGHTDATA_API_KEY with SERP zone and GOOGLE_MAPS_API_KEY. Configure only where the corresponding capability is exercised. Never place keys in NEXT_PUBLIC_* or commit fixture secrets.

**P1 optional:** TrueForge service with its own authenticated endpoint, named agent and model provider; only then enable IGOR_TRUEFORGE_ENABLED, TRUEFORGE_BASE_URL, TRUEFORGE_AGENT_NAME, remote TRUEFORGE_TOKEN. Local no-login TrueForge must remain loopback-only. Browserbase is an optional read-only observer; not a cross-app acting connector. OAuth, scheduled proactive activities and execution of external writes are deferred and need user consent, authorization scopes, idempotency, rollback and audit.

**CI (I):** qloo-test's single-branch workflow reads Igor's current active development SHA and runs static checks, unit suite, build, and recorded Chromium journeys. It executes on qloo-test push, manual workflow dispatch or periodic schedule; Igor push does **not** automatically invoke qloo-test as an ordinary same-repository push trigger. Repo-wide formatting remains nonblocking debt. Igor's own Actions runners were failing before job steps. Do not conflate this with a failing application build.

## 7. The two required acceptance journeys

| Gate | Six-person gathering | Listening bar |
| --- | --- | --- |
| Open-ended first turn | Starts from ordinary natural language | Starts from founder, audience, finite budget |
| True cultural retrieval | Qloo-derived film/music/artist choices, source IDs | Cross-domain artist/place/brand signals actually supported by Qloo |
| Practical grounding | Timings, group budget, access unknowns | Actual venues or market signals, cost/permit/acoustic unknowns |
| Composition | Feasible programme + editable invitation | Sound/menu/space/identity concept + launch brief |
| Critique | Group compatibility and contradictions | Audience fit, conflicting themes, budget feasibility |
| Revision | Friend dislikes music: revise affected choices | Half budget/no alcohol: revise affected choices only |
| Persistence | Reload, continue thread and retain protected edits | Reload, retain approved positioning and source links |
| Proof | LIVE provider trace, actual browser captures | Independent second goal using same interfaces and engine |

For every gate: verify **actual** provider calls separately from CACHED/recorded demo mode. Do not call a cached screenshot proof of live execution. Where no live data is available, render explicit unknowns.

## 8. Implementation sequence and release gate

1. **Make the existing P0 loop reliable:** one owner-scoped task, unscripted messages, live Qloo and model call, source-backed candidate, work draft, browser reload, correction and preserved edits; report failures in trace and UI.
2. **Establish durable deployment:** Railway volume, four paths, backups and restored test task; server-only secrets; single replica; deny unwanted external writes.
3. **Implement the experience graph within existing Task / WorkState:** typed domain nodes and dependency links, per-edge evidence/interpretation, independent fit/feasibility critique, selective invalidation with approval protection. Avoid a new app or DB for Gastro-Acoustic.
4. **Run both demonstrations on identical engine and product surface:** live and recorded paths explicitly distinct; manual user verdict and screenshots on desktop/mobile.
5. **Optional TrueForge live A/B:** compare latency, continuity, costs, tool behavior and completion on identical input; only promote it beyond an optional tool if it demonstrably outperforms the existing loop.
6. **CI before merge:** strict relevant formatting, TS, lint, full unit suite, evaluation, production build, both main browser journeys, live-provider acceptance, release health and screenshots at the **same** SHA. Keep PR #27 draft until checked and authorized.

### What not to build right now

No new Igor branches; no second chat application; no universal HUD or AI-generic UI; no automatic external purchases/bookings; no fabricated Qloo recommendations or pretend Gastro-Acoustic correlations; no unverified Redis/Postgres migration, vector database or queue merely for architecture appeal.

### Critical design choice

**Igor's Task + evidence + dependency graph remain the product's source of truth. The model and TrueForge propose; providers observe; capability evaluators validate; the user approves; Igor persists.** Everything else is a replaceable implementation detail.
