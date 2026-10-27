# Igor Liquid UI — human QA and release handoff

**Scope:** PR #13, `feat/validated-liquid-workflow-20261027`. **Do not test the unmerged changes on production as if already shipped.** No preview/staging URL was verified during implementation. Ask the independent reviewer to provide a preview of the PR branch before human QA. The production app is not changed by this PR.

## What this PR actually implements

One state-backed, validated interaction path over **existing, current cultural candidates**:

1. **Explore**: inspect a discovery candidate and its saved evidence; choose it for a plan or mark it for comparison.
2. **Connections**: inspect real Qloo provider-returned query seeds, rank within the query, returned candidates, and recorded limitations. The view stays unavailable without relevant source-backed signals.
3. **Compare**: select at least two current options for comparison; press **Compare (2)**. The same saved candidates and evidence are shown side-by-side, without new provider calls.
4. **Plan**: choose one offered candidate; press **Shape a plan**. The canvas becomes an editable shortlist. Assign a day, add/remove eligible options, or ask Igor to draft a fuller plan through its current model.
5. **Persist**: return to Explore or Compare, reload or reopen the thread, and verify selected options, comparison membership, day assignments and active view still exist.
6. **Natural language**: when two options are already selected for comparison, saying **“Compare the two options I chose”** can be interpreted by the model as a validated `canvas-view` action. That path saves just the surface state and deliberately skips Qloo and outcome regeneration.

Each mutation goes through owner authorization, the existing task optimistic-version check, node/option membership validation, and current-data checks. Qloo evidence on a card is an actual previously saved evidence record, not a newly invented score. A source is labelled Qloo only when the persisted record's source is `provider-returned`.

## QA script for product owner (on preview, not production)

- Open a new test thread; ask Igor for culturally informed options using an explicit taste reference (e.g., Sade and an independent film). Ensure the Qloo provider is configured. If no grounded candidates are returned, note the missing upstream capability rather than treating a UI button as a substitute.
- With **at least two live/current discovery candidates**, open **Connections** when available; inspect the provider provenance and confirm no relationship is invented when evidence is absent. Then select two **Compare** actions and press **Compare (2)**. Confirm they are the *same* options, with the same descriptions and clickable evidence.
- Choose the second option; press **Shape a plan**. Confirm the chosen option appears. Add another suggestion, assign it Day 2, remove it, re-add it. Confirm no paid action or booking is claimed.
- Go back to Explore, then Compare; refresh or reopen the thread. All explicit selections and the current work view should persist.
- Try a normal follow-up: “Actually, compare those two.” Inspect whether the interface changes without unrelated cultural discovery or lost saved work. This still requires live model verification.
- Ask for a written plan using **Draft a plan with Igor**. Evaluate the actual drafted result independently: it may have separate quality or groundedness issues outside this PR.
- Reproduce ambiguous short replies (“Go”, “No”, “I meant something else”) in a new thread; check that they are not silently stored as a taste profile.
- On a narrow phone screen, inspect the three toolbar buttons, evidence disclosure, option cards, day selector, touch targets and keyboard focus. Check reduced-motion preferences and basic screen-reader labels.

## Explicit failure cases to inspect

- Compare with fewer than two selected options: disabled UI, server rejects forged request.
- Attempt to select stale or nonexistent candidate IDs: server rejects.
- Attempt a mutation with an old canvas surface ID or stale task version: server rejects.
- Unrelated owner cannot mutate the test user's work.
- No Qloo evidence: display the absence; never fabricate a score.
- No price currency, verified availability, booking or routing: do not claim it.

## Limitations and release gates

- **No tests are claimed passed.** The GitHub-hosted verification and mobile workflows currently fail before executing any steps; this also affected `main`. The reviewer must diagnose the runner/account issue or run `npm ci && npm run typecheck && npm test && npm run test:browser` in an authorized environment.
- **No fresh live Qloo call was verified** in this engineering turn. The current surface only exposes the existing integration's saved evidence.
- **No authentic browser captures** have been produced for this PR; film capture starts only after preview and QA confirm the real interactions.
- This is one strong UI composition over an existing schema, not universal arbitrary generative UI. Discovery-to-comparison-to-shortlist is real; producing an independently researched, detailed itinerary still depends on the current model/capability layer.
- The application still uses bounded cultural goal policies. This PR does not assert completion of unrestricted general-purpose planning or independently durable background execution.
- If the PR is out of date with `main`, reconcile recent changes without overwriting other engineering work.

**Required to release:** successful typecheck, tests and browser checks; live Qloo provenance; human acceptance of the hero journey; independent engineering approval; controlled deployment. No merge or deployment has been authorized for this branch.
