import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { SqliteTaskStore } from "../../src/data/store";
import { AuthStore } from "../../src/data/auth-store";
import { OutcomeStore } from "../../src/data/outcome-store";
import { SqliteResponseCache } from "../../src/tools/qloo-cache";
import { freshTask } from "../../src/data/fixtures";
import { evaluateCandidates } from "../../src/capabilities/evaluate";
import { applyWorkActions } from "../../src/core/connected-work";
import {
  backupState,
  restoreState,
  verifySnapshot,
} from "../../scripts/persistence-snapshot.mjs";

function fixture(root: string) {
  const env = Object.fromEntries(
    [
      "IGOR_DB_PATH",
      "IGOR_AUTH_PATH",
      "IGOR_OUTCOMES_PATH",
      "IGOR_CACHE_PATH",
    ].map((key, i) => [key, join(root, `${i}.sqlite`)]),
  );
  const auth = new AuthStore(env.IGOR_AUTH_PATH);
  const account = auth.register(
    {
      action: "register",
      username: "restore_test",
      password: "synthetic-password-for-recovery",
    },
    randomUUID(),
  );
  const owner = auth.owner(account.token);
  const tasks = new SqliteTaskStore(env.IGOR_DB_PATH);
  const outcomes = new OutcomeStore(env.IGOR_OUTCOMES_PATH);
  const cache = new SqliteResponseCache(env.IGOR_CACHE_PATH);
  const task = freshTask("backup-work", owner);
  task.candidates = evaluateCandidates(task.catalogue, task);
  applyWorkActions(task, [
    { kind: "goal", id: "concept", title: "Recovery concept" },
    {
      kind: "document",
      id: "brief",
      title: "Saved wording",
      content: "Owner wording must survive restoration.",
      dependencies: [],
      evidenceIds: [],
    },
    { kind: "approve", id: "brief" },
  ]);
  tasks.create(task);
  task.brief.version++;
  tasks.save(task, 0, owner, {
    operation: "save",
    preference: {
      id: "confirmed-taste",
      subject: "you",
      value: "Radiohead",
      polarity: "like",
      source: "user-supplied",
      confirmed: true,
      scope: "persistent",
    },
  });
  const collection = outcomes.collect(task, "Saved references", [
    task.candidates[0].id,
  ]);
  cache.set("mock-query", {
    at: new Date().toISOString(),
    body: { results: [] },
  });
  const accepted = tasks.acceptTurn(task.id, owner, "pending-turn", {
    type: "message",
    text: "Keep the approved wording",
    version: task.brief.version,
  });

  const close = () => {
    tasks.close();
    auth.close();
    outcomes.close();
    cache.close();
  };

  return {
    env,
    tasks,
    auth,
    outcomes,
    cache,
    task,
    owner,
    account,
    collection,
    accepted,
    close,
  };
}

describe("Coordinated four-store snapshot and restore", () => {
  it("restores accounts, accepted messages, lease journal, approvals, saved collections and cached evidence including committed WAL", async () => {
    const root = mkdtempSync(join(tmpdir(), "igor-restore-"));
    const f = fixture(root);
    const output = join(root, "snapshot");
    const restored = join(root, "restored");

    try {
      // Handles remain open so committed WAL writes have not been lost through a raw main-file copy.
      await backupState(output, { quiesced: true, env: f.env });
      expect((await verifySnapshot(output)).files).toHaveLength(4);
      expect(statSync(output).mode & 0o777).toBe(0o700);
      f.auth.logout(f.account.token);
      f.cache.set("mock-query", {
        at: new Date().toISOString(),
        body: { results: [], query: { changed: true } },
      });
      await restoreState(output, restored, { quiesced: true });
      const auth = new AuthStore(join(restored, "auth.sqlite"));
      const tasks = new SqliteTaskStore(join(restored, "workspace.sqlite"));
      const outcomes = new OutcomeStore(join(restored, "outcomes.sqlite"));
      const cache = new SqliteResponseCache(
        join(restored, "qloo-cache.sqlite"),
      );

      try {
        expect(auth.owner(f.account.token)).toBe(f.owner);
        expect(auth.identity(f.account.token)).toEqual({
          username: "restore_test",
        });
        expect(tasks.memory(f.owner)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "confirmed-taste",
              value: "Radiohead",
              scope: "persistent",
            }),
          ]),
        );
        const saved = tasks.load(f.task.id, f.owner);
        expect(saved.work?.documents[0]).toMatchObject({
          content: "Owner wording must survive restoration.",
          status: "approved",
        });
        expect(saved.messages.at(-1)?.text).toBe("Keep the approved wording");
        expect(tasks.readTurn(f.task.id, f.owner, "pending-turn").runId).toBe(
          f.accepted.runId,
        );
        expect(outcomes.collections(f.owner)[0]).toEqual(f.collection);
        expect(outcomes.collections("stranger")).toEqual([]);
        expect(cache.get("mock-query")?.body).toEqual({ results: [] });
        expect(statSync(join(restored, "auth.sqlite")).mode & 0o777).toBe(
          0o600,
        );
      } finally {
        auth.close();
        tasks.close();
        outcomes.close();
        cache.close();
      }
    } finally {
      f.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects incomplete or tampered backups and refuses to replace existing state", async () => {
    const root = mkdtempSync(join(tmpdir(), "igor-restore-boundary-"));
    const f = fixture(root);
    const output = join(root, "snapshot");

    try {
      await expect(backupState(output, { env: f.env })).rejects.toThrow(
        "Stop application writes",
      );
      await expect(
        backupState(output, {
          quiesced: true,
          env: { ...f.env, IGOR_CACHE_PATH: join(root, "missing") },
        }),
      ).rejects.toThrow();
      await backupState(output, { quiesced: true, env: f.env });
      await expect(
        backupState(output, { quiesced: true, env: f.env }),
      ).rejects.toThrow();
      await expect(
        restoreState(output, output, { quiesced: true }),
      ).rejects.toThrow();
      const cli = fileURLToPath(
        new URL("../../scripts/persistence-snapshot.mjs", import.meta.url),
      );
      const valid = spawnSync(
        process.execPath,
        [cli, "verify", "--input", output],
        { encoding: "utf8" },
      );
      expect(valid.status).toBe(0);
      writeFileSync(join(output, "auth.sqlite"), "damaged");
      const rejected = spawnSync(
        process.execPath,
        [cli, "verify", "--input", output],
        { encoding: "utf8" },
      );
      expect(rejected.status).toBe(1);
      expect(rejected.stdout).not.toContain("completed");
      expect(rejected.stderr).toContain("Snapshot failed");
      await expect(verifySnapshot(output)).rejects.toThrow("checksum mismatch");
      await expect(
        restoreState(output, join(root, "bad-restore"), { quiesced: true }),
      ).rejects.toThrow();
      expect(f.auth.identity(f.account.token)).toEqual({
        username: "restore_test",
      });
    } finally {
      f.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
