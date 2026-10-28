## P0 follow-up: installed AI SDK agent spike

- Source: https://github.com/vercel/ai , package pinned by lockfile to `ai@7.0.155`.
- License: Apache-2.0, verified from installed `ai/LICENSE`.
- Files inspected: `src/agent/tool-loop-agent.ts`, agent settings/stop condition, `src/test/mock-language-model-v4.ts`.
- Classification: integrated API in isolated test only (`tests/unit/tool-loop-spike.test.ts`). Existing Igor document tool schema, executor and SQLite ownership/version check remain authoritative.
- Result: two mocked model steps create and reload one real saved artifact. No live inference, Qloo effectiveness or approval-resume superiority is established. Production migration remains deferred pending the required comparative live spike. No new framework/dependency was installed.
