# Igor agent interface: research and implementation contract

27 October 2026. Visual foundation: the existing Partiful-based Igor landing page. The Cosmos experiment is reverted. This brief concerns interaction and continuity, not another palette or layout experiment.

## Method and evidence boundary

Reviewed current official product documentation and published examples for Claude, Manus, Perplexity and v0, including Manus's official task-computer screenshot. Inspected Igor's current UI, task contracts, activity events and model context. Competitors were not tested in signed-in sessions. Their documentation establishes published behaviour; it does not establish independent reliability or performance. Recommendations below are design inferences, not competitor capabilities automatically available in Igor.

## Patterns worth applying

| Reference                                                                                                                 | Documented behaviour                                                                                                                 | Implication for Igor                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Claude artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)              | Work opens beside the conversation, supports direct edits and conversational revision, and can be found again in an artifacts space. | Give each output a durable identity and a clear entry in the thread and work library. Preserve the same object while editing and refining.                                       |
| [Claude interactive connectors](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)     | Compact interactions can appear inline; complex views can expand while conversation remains available.                               | Questions and single actions belong close to their messages. Expanded work must retain access to the composer on mobile.                                                         |
| [Perplexity research UX](https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research) | Clarification, progress, findings during execution, follow-ups during work, and editable reports are documented.                     | Distinguish waiting for an answer, executing, needing input, and delivering work. Surface evidence as it arrives. Concurrent follow-ups need real orchestration support.         |
| [v0 Design mode](https://v0.app/docs/design-mode)                                                                         | Direct and conversational edits share a preview. Pending changes can be compared or reset; applying creates a reviewable version.    | Show unsaved changes, saved revision and affected output. A revision should be inspectable, not just announced in chat.                                                          |
| [Manus Projects](https://manus.im/features/projects)                                                                      | Instructions and selected sources are reused across tasks in a project.                                                              | Returning users need visible retained context and useful work to resume. Chat history alone is insufficient. Igor's preference memory is narrower than a project knowledge base. |
| [Manus Wide Research](https://manus.im/features/wide-research)                                                            | Its published screenshot separates conversation from task activity and working output.                                               | Show actual work units, sources and results in a legible hierarchy. Igor has no justified percentage-complete estimate; do not copy a progress percentage.                       |

## What the code audit found

1. **The feedback contract is stronger than its UI.** `src/core/agent-events.ts` emits typed activity metadata: tool calls, evidence, created and revised artifacts, failures and state changes. `use-workspace.ts` currently retains message strings for feedback, losing those typed distinctions. `agent-workspace.tsx` shows one current string, with a retrospective text list. A spinner cannot explain what is happening or what requires attention.
2. **Questions lack an interaction contract.** `src/core/presentation.ts` supports tables, documents, timelines, discoveries and spatial views, but has no question or bounded form node. The current shell offers entity disambiguation buttons; general clarification remains prose. `brief.unresolved` exists in task/model state but is not presented as a structured response surface in the new shell. Do not invent travel or gifting forms based on keywords.
3. **Work can take the user away from the conversation.** `agent-workspace.tsx` changes to the work pane when a new canvas identity arrives. Mobile CSS hides the conversation and its composer in that pane. A result should enter the conversation as an inspectable object; opening it should be deliberate, and refinement must remain reachable.
4. **The work renderer chooses one representation.** `Work` prefers `TaskCanvas`, then `ConnectedWorkCanvas`, then legacy artifacts. Several data families can coexist, so this preference chain can leave valid work without an obvious entry. Establish a unified output index referencing authoritative IDs; do not copy documents into another client store.
5. **Saved collections are not a complete work library.** The Saved screen uses candidate collections. Connected documents and canvas outputs remain tied to reopening their conversation. Returning should expose the user's plans, decisions and drafts as well as saved references.
6. **Memory is difficult to inspect.** The backend has explicit preference scope and memory actions. The new shell provides no clear retained-preference management. A useful returning experience must disclose what is remembered, allow correction/removal, and distinguish confirmed preferences from inference.
7. **Recovery exists, but authority needs clearer presentation.** Version checks, local draft retention, retry and conflict handling already exist. The UI should identify which output was saved, which is being revised, and what remains unchanged. Approval controls must represent stored approvals, not a decorative success state.

## Required interaction sequence

| Moment  | Visible experience                                                                                                    | Source of truth                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Return  | Resume named work, or begin a goal; compact composer and restrained starter examples.                                 | Owned saved tasks and outputs, not invented personalization.                                        |
| Submit  | Message appears immediately; input remains usable for drafting.                                                       | Existing optimistic-message acknowledgement logic.                                                  |
| Clarify | One focused question with bounded choices or fields when useful; free text always available.                          | Validated, model-authored question schema with stable IDs; explicit submission through a task turn. |
| Execute | A concise current action and expandable real activity. Clearly distinguish blocked, failed and awaiting-input states. | Typed server activity; persisted trace for reload. No simulated stages or percentages.              |
| Deliver | An output entry in the conversation showing its title and saved state; inspect or edit beside the thread.             | Stored document, artifact or composition identity and version.                                      |
| Refine  | Selected output is clear; typed edits and natural-language edits update the same work.                                | Version-checked task mutations and model context.                                                   |
| Review  | Identify changed, retained, stale and approved material; inspect previous saved content.                              | Actual revision history, dependencies and approval state.                                           |
| Reuse   | Find the work again and carry confirmed relevant context into the next task.                                          | Owner-scoped task/output index and explicit memory policy.                                          |

## Implementation order

**First: repair the current interaction loop without another redesign.** Retain typed activity in the controller; render a compact activity component. Keep the mobile composer reachable with work open. Add thread entries that open existing output IDs. Stop automatically moving focus away from the conversation. Search and group existing saved tasks so resumption is useful.

**Second: add the missing declarative inputs.** Extend the trusted vocabulary with bounded questions, not unrestricted executable UI. Define supported input types, allowed choices, submission IDs, task version checks, validation errors, answered state and reload restoration. UI answers must reach the agent as user-provided information. No fabricated choices, inferred budgets or silently confirmed dates.

**Third: close the return loop.** Unify access to existing document/canvas/artifact records, expose confirmed preference management, and add inspectable revision summaries. Selective revision must preserve approved and manually edited work.

**Backend work that cannot be drawn into existence:** durable cancellation, queued follow-ups during execution, arbitrary external approvals/actions, general live web research, attachments and ongoing background work. Implement their actual lifecycle before advertising those controls. A disconnected stream is not proof that server work stopped.

## Release checks for the interaction work

- A user can identify what Igor is doing, answer a question, inspect a source and edit a result without navigating to unrelated screens.
- Editing on mobile keeps a route back to conversation and a usable composer; keyboard opening does not hide the current control.
- Direct edits, conversational revision and reload all resolve to the same saved object and version.
- Failure preserves visible work and offers a truthful recovery action.
- Returning exposes meaningful saved work and its context without requiring the user to repeat the original brief.
- Evidence distinguishes live retrieval, recorded responses, supplied facts and drafts. No comparative quality or Qloo-lift claim is inferred from visual polish.

Igor's differentiated loop should be: the user's goal and confirmed preferences lead to attributable cultural connections where relevant, then to useful editable work that survives refinement and return. The next product pass should prove that loop before adding more decorative surfaces.

## Recording study and implemented corrections — 27 October, second pass

Reference: the supplied 97-second Partiful recording. Reviewed the full recording as sequential frames, with closer inspection of the editor, expanded rail, Explore and card creation states. The first minute is primarily marketing; the app portion is approximately 63–97 seconds. This is a desktop recording, so it cannot validate phone behaviour.

- **63–75 seconds: create flow.** A slim persistent rail, expansion on hover, controls placed at the editable object, a large preview and peripheral theme/settings tools. The atmosphere belongs to the whole screen, rather than a bordered dashboard enclosing a chat. Igor now removes the nested chat window and duplicate recent-conversation sidebar; desktop navigation is a narrow expandable rail. Its light paper palette, Archivo and original marks remain consistent with the approved landing page.
- **78–89 seconds: Explore.** Content and imagery carry the hierarchy. Navigation stays stable between work contexts. Igor retains the welcome screen's existing starter imagery and does not add another themed hero or Cosmos treatment.
- **90–95 seconds: card editor.** The object is central and editable; small tools support it. Igor exposes existing documents, drafts, workspace and grounded places through explicit resource controls instead of a precedence chain hiding valid outputs.
- **Loading and transitions.** Igor keeps restored work mounted while another task loads. On a cold return, server-readable layout flags reserve the actual conversation/result columns; placeholders render within the same header, message, output and composer structure. Fresh sessions render the real welcome screen immediately. The flags contain layout choices only, not conversation content. Generic simulated answer paragraphs have been removed. Native view transitions connect supported surface changes, with reduced-motion fallback.

The interaction work follows [assistant-ui's documented generative UI pattern](https://www.assistant-ui.com/docs/tools/generative-ui): compose a shipped, trusted component vocabulary, rather than execute arbitrary generated interface code. Igor keeps its existing renderer and adds a bounded question node with text, numeric, date and choice inputs. Required fields, offered choices, valid dates/numbers, ownership and task versions are checked server-side. Submitting is one real agent turn; answers remain in saved canvas state and model context. Plain conversational input remains available.

Grounded current place coordinates can enrich an agent-authored canvas without replacing documents or saved inputs. The Places resource opens the real spatial component. [Google's Maps setup](https://developers.google.com/maps/documentation/javascript/get-api-key) and [3D documentation](https://developers.google.com/maps/documentation/javascript/3d/get-started) require a configured API key and enabled services. This change does not verify Railway's credentials, billing, geographical coverage or a live 3D render; unavailable maps retain the truthful place-list/error experience.

Validation: focused tests cover malformed/obsolete answers, one-turn agent continuation, persisted answers/model context, conflict protection, map enrichment preserving authored work, and rejected invalid coordinates. Production compilation and type checks are required before publishing. Automated browser visual QA remains unavailable in this environment because its Chromium executable is missing; no visual QA claim is made.
