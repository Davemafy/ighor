import { readRecordingText } from "../../src/tools/recording-file";
import { describe, it, expect } from "vitest";
import { RecordedQlooProvider } from "../../src/tools/recorded-qloo";
import { freshLiveTask } from "../../src/data/live-task";
import { SqliteTaskStore } from "../../src/data/store";
import { runTurn } from "../../src/core/orchestrator";
import {
  LiveQlooProvider,
  MemoryResponseCache,
} from "../../src/tools/qloo-live";
import { fitFor } from "../../src/capabilities/collaborate";
import { DevelopmentModel } from "../../src/tools/development-model";

const recording = JSON.parse(
  readRecordingText("tests/fixtures/qloo-cultural.json.gz"),
);

const probe = JSON.parse(
  readRecordingText("tests/fixtures/place-probe-summary.json"),
);

const tokyoResponse = recording.qloo_records.find(
  (record: { path: string; params: Record<string, string> }) =>
    record.path === "/v2/insights" &&
    record.params["filter.type"] === "urn:entity:place" &&
    record.params["filter.location.query"] === "Tokyo",
).response;

describe("Locality-filtered place discovery from actual provider records", () => {
  it("uses an explicitly supplied personal profile instead of assuming the sample group represents the user", async () => {
    const store = new SqliteTaskStore(":memory:");

    try {
      store.create(freshLiveTask("t", "o"));
      const provider = new RecordedQlooProvider(recording);
      let task = await runTurn(
        store,
        "t",
        "o",
        {
          type: "personal-profile",
          name: "You",
          artist: "Radiohead",
          version: 0,
        },
        undefined,
        provider,
      );
      expect(task.brief.participants).toHaveLength(1);
      expect(task.brief.participants[0]).toMatchObject({
        id: "you",
        sample: false,
      });
      expect(task.candidates).toHaveLength(30);
      expect(
        task.candidates.every(
          (c) => Boolean(c.cultural?.you) && !c.cultural?.amara,
        ),
      ).toBe(true);
      expect(store.memory("o")).toEqual([]);
      task = await runTurn(
        store,
        "t",
        "o",
        {
          type: "message",
          text: "I am not interested in Radiohead.",
          version: task.brief.version,
        },
        undefined,
        provider,
      );
      expect(
        task.brief.participants[0].preferences.find(
          (p) => p.value === "Radiohead",
        )?.polarity,
      ).toBe("not-now");
      expect(provider.calls).toBe(0);
    } finally {
      store.close();
    }
  });
  it("retains actual location/context responses and distinguishes taste responsiveness from user value", () => {
    expect(probe.qloo_requests).toBe(4);
    expect(probe.model_requests).toBe(0);
    expect(probe.overlap).toMatchObject({
      taste_intersection: 2,
      city_intersection: 0,
    });
    expect(
      recording.qloo_records.find(
        (record: { path: string; params: Record<string, string> }) =>
          record.path === "/v2/insights" &&
          record.params["filter.type"] === "urn:entity:place" &&
          record.params["filter.location.query"] === "Tokyo",
      ).response.query.localities.filter[0],
    ).toMatchObject({ name: "Tokyo", disambiguation: "東京都" });
  });
  it("completes the Tokyo example with mapped provider coordinates and unknown practical facts", async () => {
    const store = new SqliteTaskStore(":memory:");

    try {
      store.create(freshLiveTask("t", "o"));
      const provider = new RecordedQlooProvider(recording);
      const task = await runTurn(
        store,
        "t",
        "o",
        { type: "place-example", city: "Tokyo", version: 0 },
        undefined,
        provider,
      );
      expect(task.brief.targetType).toBe("place");
      expect(task.brief.participants).toHaveLength(1);
      expect(task.candidates).toHaveLength(10);
      expect(
        task.candidates.every(
          (c) =>
            c.type === "place" &&
            c.eligibility === "needs-review" &&
            c.cost.value === null &&
            c.duration.value === null &&
            c.available === null,
        ),
      ).toBe(true);
      const museum = task.candidates.find((c) => c.name === "Ghibli Museum")!;
      expect(museum.place).toMatchObject({
        latitude: 35.696238,
        longitude: 139.5704317,
        locality: { name: "Tokyo", disambiguation: "東京都" },
      });
      expect(museum.cultural?.amara?.explanationScope).toBe("recommendation");
      expect(task.brief.selected).toEqual([]);
      expect(provider.calls).toBe(0);
    } finally {
      store.close();
    }
  });
  it("uses the same place capability for Amsterdam and invalidates supplied facts when locality changes", async () => {
    const store = new SqliteTaskStore(":memory:");

    try {
      store.create(freshLiveTask("t", "o"));
      const provider = new RecordedQlooProvider(recording);
      let task = await runTurn(
        store,
        "t",
        "o",
        { type: "place-example", city: "Tokyo", version: 0 },
        undefined,
        provider,
      );
      task = await runTurn(
        store,
        "t",
        "o",
        {
          type: "message",
          text: "For Ghibli Museum: cost $5, duration 60 minutes, access confirmed.",
          version: task.brief.version,
        },
        undefined,
        provider,
      );
      expect(task.brief.selected).toHaveLength(1);
      task = await runTurn(
        store,
        "t",
        "o",
        {
          type: "message",
          text: "Location: Amsterdam",
          version: task.brief.version,
        },
        undefined,
        provider,
      );
      expect(task.candidates).toHaveLength(10);
      expect(
        task.candidates.every(
          (c) =>
            c.type === "place" &&
            c.place?.locality?.name === "Amsterdam" &&
            c.cost.value === null,
        ),
      ).toBe(true);
      expect(task.brief.selected).toEqual([]);
      expect(task.schedule).toEqual([]);
      expect(provider.calls).toBe(0);
    } finally {
      store.close();
    }
  });
  it("follows a real place-to-artist connection without turning a place into a person's preference", async () => {
    const store = new SqliteTaskStore(":memory:");

    try {
      store.create(freshLiveTask("t", "o"));
      const provider = new RecordedQlooProvider(recording);
      let task = await runTurn(
        store,
        "t",
        "o",
        { type: "place-example", city: "Tokyo", version: 0 },
        undefined,
        provider,
      );
      const people = structuredClone(task.brief.participants);
      const museum = task.candidates.find((c) => c.name === "Ghibli Museum")!;
      task = await runTurn(
        store,
        "t",
        "o",
        {
          type: "connection",
          candidateId: museum.id,
          targetType: "artist",
          version: task.brief.version,
        },
        undefined,
        provider,
      );
      expect(task.candidates).toHaveLength(10);
      expect(
        task.candidates.every(
          (c) => c.type === "artist" && c.eligibility === "needs-review",
        ),
      ).toBe(true);
      expect(
        task.candidates.every(
          (c) =>
            c.cultural?.context?.signalScope === "context" &&
            c.fitReason.includes("entity-context"),
        ),
      ).toBe(true);
      expect(
        fitFor(task.candidates[0], [
          { id: "context", name: "A person", preferences: [], sample: false },
        ]).context,
      ).toBe(0);
      expect(task.brief.contextAnchor?.providerId).toBe(museum.providerId);
      expect(task.brief.participants).toEqual(people);
      expect(
        task.candidates.every(
          (c) =>
            c.cultural?.context?.seedIds[0] === museum.providerId &&
            !c.cultural?.amara,
        ),
      ).toBe(true);
      expect(task.schedule).toEqual([]);
      expect(provider.calls).toBe(0);
      await expect(
        runTurn(
          store,
          "t",
          "o",
          {
            type: "connection",
            candidateId: "invented",
            targetType: "artist",
            version: task.brief.version,
          },
          undefined,
          provider,
        ),
      ).rejects.toThrow("current provider-returned");
    } finally {
      store.close();
    }
  });
  it("asks for a consequential missing locality before making place calls", async () => {
    const store = new SqliteTaskStore(":memory:");

    try {
      store.create(freshLiveTask("t", "o"));
      const provider = new RecordedQlooProvider(recording);
      const task = await runTurn(
        store,
        "t",
        "o",
        { type: "message", text: "Find places.", version: 0 },
        undefined,
        provider,
      );
      expect(task.status).toBe("clarification");
      expect(task.brief.unresolved.join(" ")).toContain("Which city");
      expect(provider.calls).toBe(0);
    } finally {
      store.close();
    }
  });
  it("interprets a place goal without pretending an itinerary or route was verified", async () => {
    const p = await new DevelopmentModel().interpret(
      "Find places in Tokyo, budget $60 and 180 minutes.",
    );
    expect(p).toMatchObject({
      kind: "discovery",
      targetType: "place",
      actions: [{ kind: "constraints", location: "Tokyo" }],
    });
  });
  it("rejects absent locality metadata and unsafe website schemes rather than inventing context", async () => {
    const source = tokyoResponse;
    const body = structuredClone(source);
    body.query = {};
    const transport = (async () => Response.json(body)) as typeof fetch;
    const seed = { ...freshLiveTask("t", "o").brief.participants[0] };
    const provider = new LiveQlooProvider(
      "test",
      new MemoryResponseCache(),
      transport,
    );
    const result = await provider.discover({
      participants: [seed],
      catalogue: [],
      entities: [
        {
          id: "r",
          original: "Radiohead",
          name: "Radiohead",
          type: "artist",
          providerId: "70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C",
          status: "resolved",
          metadata: "recorded",
          choices: [],
        },
      ],
      location: "Tokyo",
      version: 0,
      mode: "none",
      targetTypes: ["place"],
    });
    expect(result.status).toBe("error");
    expect(result.data.options).toEqual([]);
    const unsafe = structuredClone(source);
    unsafe.results.entities[0].properties.website = "javascript:alert(1)";
    const safeProvider = new LiveQlooProvider(
      "test",
      new MemoryResponseCache(),
      (async () => Response.json(unsafe)) as typeof fetch,
    );
    const safe = await safeProvider.discover({
      participants: [seed],
      catalogue: [],
      entities: [
        {
          id: "r",
          original: "Radiohead",
          name: "Radiohead",
          type: "artist",
          providerId: "70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C",
          status: "resolved",
          metadata: "recorded",
          choices: [],
        },
      ],
      location: "Tokyo",
      version: 0,
      mode: "none",
      targetTypes: ["place"],
    });
    expect(safe.data.options[0].place?.website).toBe(null);
  });
});
