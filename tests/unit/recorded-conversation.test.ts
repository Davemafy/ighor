import { readRecordingText } from "../../src/tools/recording-file";
import { describe, expect, it } from "vitest";
import { freshLiveTask } from "../../src/data/live-task";
import { SqliteTaskStore } from "../../src/data/store";
import { RecordedQlooProvider } from "../../src/tools/recorded-qloo";
import { GeminiModel } from "../../src/tools/gemini-model";
import { DevelopmentModel } from "../../src/tools/development-model";
import { runTurn } from "../../src/core/orchestrator";
import { assertArtifactIntegrity } from "../../src/capabilities/evaluate";

const qloo = JSON.parse(
  readRecordingText("tests/fixtures/qloo-cultural.json.gz"),
);

const captured = JSON.parse(
  readRecordingText("tests/fixtures/conversation-probe-revision-2.json"),
);

describe("Actual provider response replay (no live requests)", () => {
  it.each([
    [
      "discovery",
      "Discover films and music, budget $60 and 180 minutes.",
      "comparison",
    ],
    [
      "creative",
      "Create a creative brief, budget $60 and 180 minutes.",
      "creative-brief",
    ],
  ])(
    "reuses the same recorded provider and capability layer for %s without a gathering schedule",
    async (kind, goal, artifactKind) => {
      const store = new SqliteTaskStore(":memory:");

      try {
        store.create(freshLiveTask("references", "owner"));
        const provider = new RecordedQlooProvider(qloo);
        let task = store.load("references", "owner");

        for (const text of [
          goal,
          "Use Moonlight from 2016.",
          "For Children of Men: cost $5, duration 80 minutes, access confirmed.",
          "For Thom Yorke: cost $5, duration 15 minutes, access confirmed.",
        ]) {
          task = await runTurn(
            store,
            "references",
            "owner",
            { type: "message", text, version: task.brief.version },
            undefined,
            provider,
            new DevelopmentModel(),
          );
        }

        expect(task.brief.kind).toBe(kind);
        expect(task.status).toBe("ready");
        expect(task.artifacts.find((a) => a.id === "main")?.kind).toBe(
          artifactKind,
        );
        expect(task.schedule).toEqual([]);
        expect(task.brief.selected).toHaveLength(2);
        expect(
          task.candidates.filter((c) => c.eligibility === "needs-review"),
        ).toHaveLength(28);
        expect(provider.calls).toBe(0);

        for (const action of [
          "cultural.discover",
          "collaborate",
          "evaluate.eligibility",
          "compose",
        ]) {
          expect(task.trace.some((t) => t.action === action)).toBe(true);
        }

        expect(
          task.trace.find((t) => t.action === "collaborate")?.outcome,
        ).toContain("per-query Qloo ranks");
        assertArtifactIntegrity(task);
        task = await runTurn(
          store,
          "references",
          "owner",
          { type: "message", text: "Budget $1", version: task.brief.version },
          undefined,
          provider,
          new DevelopmentModel(),
        );
        expect(task.brief.selected).toEqual([]);
        expect(task.receipts?.at(-1)?.culturalRequests).toBe(0);
      } finally {
        store.close();
      }
    },
  );
  it("executes all four freshly captured Gemini corrections through the real adapter and task engine", async () => {
    const store = new SqliteTaskStore(":memory:");

    try {
      store.create(freshLiveTask("replay", "owner"));
      const provider = new RecordedQlooProvider(qloo);
      const scripted = new DevelopmentModel();
      let task = store.load("replay", "owner");

      const message = async (
        text: string,
        model = scripted as DevelopmentModel | GeminiModel,
      ) => {
        task = await runTurn(
          store,
          "replay",
          "owner",
          { type: "message", text, version: task.brief.version },
          undefined,
          provider,
          model,
        );

        return task;
      };

      await message(
        "Plan a gathering for six friends, budget $60 and 180 minutes.",
      );
      expect(task.status).toBe("clarification");

      const replay = async (index: number) => {
        const testCase = captured.cases[index];
        const response = captured.model_records[index].response;
        expect(response).toBeDefined();
        const transport = (async () => Response.json(response)) as typeof fetch;
        const model = new GeminiModel(
          "recorded-test-only",
          "gemini-3.5-flash-lite",
          transport,
        );
        await message(testCase.text, model);
        expect(model.calls).toBe(1); // Adapter calls, not external network requests.
        expect(task.status).not.toBe("error");
        expect(task.receipts?.at(-1)?.modelRequests).toBe(1);
      };

      await replay(0);
      expect(task.candidates).toHaveLength(30);
      expect(
        task.entities.find((e) => e.original === "Moonlight")?.providerId,
      ).toBe("2955F3C4-36AB-49F3-A818-3597F35EF46C");
      await replay(1); // Actual response splits facts across two actions; both are valid.
      expect(
        task.catalogue.find((c) => c.name === "Children of Men"),
      ).toMatchObject({
        cost: { value: 5, source: "user-supplied" },
        duration: { value: 80 },
        available: true,
      });
      await message(
        "For Thom Yorke: cost $5, duration 15 minutes, access confirmed.",
      );
      expect(task.status).toBe("ready");
      expect(task.schedule.reduce((n, s) => n + s.minutes, 0)).toBe(135);
      const selection = [...task.brief.selected];
      await replay(3);
      expect(task.artifacts.find((a) => a.id === "invitation")?.content).toBe(
        "Bring your curiosity.",
      );
      expect(task.brief.selected).toEqual(selection);
      expect(task.receipts?.at(-1)?.culturalRequests).toBe(0);
      await message("Lower budget to $1");
      expect(task.brief.selected).toEqual([]);
      expect(task.receipts?.at(-1)?.culturalRequests).toBe(0);
      await message("Budget $60");
      await replay(2);
      const amara = task.brief.participants.find((p) => p.name === "Amara")!;
      expect(
        amara.preferences.find((p) => p.value === "Radiohead")?.polarity,
      ).toBe("unknown");
      expect(
        amara.preferences.find((p) => p.value === "Kendrick Lamar")?.polarity,
      ).toBe("like");
      expect(task.brief.participants).toHaveLength(6);
      expect(provider.calls).toBe(0);
      assertArtifactIntegrity(task);
    } finally {
      store.close();
    }
  });
});
