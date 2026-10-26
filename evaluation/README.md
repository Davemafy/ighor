# Igor outcome study: discovery, decision, creation

This is a **user-value evaluation**, not a tool-call score or a marketing number. Our test is whether someone gets a more meaningful result because the agent has Qloo cultural intelligence.

## 1. Gather real paired results

Run the eight goals in evaluation/cases.json. Six span discovery, choice and creation; two negative-control prompts should never invoke Qloo. For each case, collect:

- The same original user goal and constraints.
- A real Igor answer and a real credible-baseline answer. Prefer the same base model and equivalent research tools, adding Qloo only for the treatment. Report differences where parity is impossible.
- Model IDs, available tools, elapsed times, factual citations, actual Qloo evidence references, and any failure.
- A de-branded but substantively unchanged output for each arm. Preserve caveats and deliverables.

Do not have Igor fabricate a baseline answer. Do not invent Qloo results, scores or participant feedback.

Create a local JSON file at evaluation/collected-runs.json following this schema:

    {
      "studyId": "your-real-study-id",
      "runs": [{
        "caseId": "D01",
        "goal": "copy case goal",
        "constraints": "copy case constraints",
        "qlooRelevant": true,
        "arms": {
          "baseline": {
            "output": "INSERT GENUINE OBSERVED BASELINE RESULT",
            "model": "real model ID",
            "toolPolicy": "describe search and tools",
            "elapsedMs": 0,
            "sourceRefs": []
          },
          "igor": {
            "output": "INSERT GENUINE OBSERVED IGOR RESULT",
            "model": "real model ID",
            "toolPolicy": "same tools plus Qloo",
            "elapsedMs": 0,
            "sourceRefs": [],
            "qlooEvidenceRefs": ["INSERT GENUINE EVIDENCE ID"]
          }
        }
      }]
    }

This is a **schema example**, not a result. The preparer validates metadata presence, not whether a claimed evidence ID truly came from Qloo; audit live/recorded provider traces separately.

For non-cultural control cases, qlooRelevant must be false and qlooEvidenceRefs must be an empty array. Cultural relevance is not an excuse to make unnecessary Qloo calls.

## 2. Prepare a blinded review

Run these commands in the repository:

    node scripts/igor-blind-eval.mjs prepare evaluation/collected-runs.json evaluation/private-study

Give reviewers only the generated blind-packet.json. Keep the separate key.json private: it identifies which arm is Igor and includes the actual provenance. The tool balances the A/B order and refuses obvious model/app branding in the blinded outputs.

Ask multiple independent people to score both results from 1 to 5 for relevance, meaningful discovery, actionability, trust and coherence. They also choose an overall preference (A, B or tie). Ask why. Aim for at least five unaffiliated reviewers for directional feedback, not statistical significance.

Save judgments in evaluation/private-study/ratings.json with these fields:

    {
      "studyId": "your-real-study-id",
      "judgments": [{
        "reviewerId": "anonymous-p1",
        "caseId": "D01",
        "winner": "tie",
        "scores": {
          "A": {"relevance": 3, "discovery": 3, "actionability": 3, "trust": 3, "coherence": 3},
          "B": {"relevance": 3, "discovery": 3, "actionability": 3, "trust": 3, "coherence": 3}
        }
      }]
    }

Scores above are **illustrative syntax only**. They are not human observations.

## 3. Analyze without inventing lift

    node scripts/igor-blind-eval.mjs score evaluation/private-study/key.json evaluation/private-study/ratings.json evaluation/private-study/report.json
    node --test scripts/igor-blind-eval.test.mjs

The report gives descriptive preference counts and mean scores, with cultural-task results separated from controls. The script does not imply statistical significance or prove causal Qloo lift if base models and tools differ.

## 4. Verify user value beyond blinded text

- Manually audit cultural claims against actual Qloo evidence (entity, association, recording time and limits).
- Manually audit concrete prices, geography, hours and availability against separate trusted sources.
- Watch first-time users: Can they start without API knowledge or tedious onboarding? How many clarifying questions? Does a usable artifact result?
- Verify that changing one constraint keeps approved unrelated work stable, and that conflicts are shown rather than hidden.
- Test a second contrasting kind of goal with the same capability system. One launch demo does not define Igor's permanent identity.

Do not publish winning percentages before actual paired outputs and human responses exist. The current evaluation code is only the measurement machinery.
