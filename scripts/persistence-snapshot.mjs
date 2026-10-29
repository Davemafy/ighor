import { backup, DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  createReadStream,
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const stores = [
  ["workspace.sqlite", "IGOR_DB_PATH"],
  ["auth.sqlite", "IGOR_AUTH_PATH"],
  ["outcomes.sqlite", "IGOR_OUTCOMES_PATH"],
  ["qloo-cache.sqlite", "IGOR_CACHE_PATH"],
];

async function checksum(path) {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

function checkDatabase(path) {
  if (!lstatSync(path).isFile()) {
    throw new Error("Snapshot files must be regular files.");
  }

  const db = new DatabaseSync(path, { readOnly: true });

  try {
    const rows = db.prepare("PRAGMA quick_check").all();

    if (rows.length !== 1 || Object.values(rows[0])[0] !== "ok") {
      throw new Error("SQLite integrity check failed.");
    }
  } finally {
    db.close();
  }
}

export async function verifySnapshot(input) {
  const manifestPath = join(input, "manifest.json");

  if (
    !lstatSync(manifestPath).isFile() ||
    lstatSync(manifestPath).size > 65536
  ) {
    throw new Error("Invalid snapshot manifest.");
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== stores.length
  ) {
    throw new Error("Incomplete snapshot.");
  }

  for (const [name] of stores) {
    const entries = manifest.files.filter((entry) => entry.name === name);

    if (entries.length !== 1 || !/^[a-f0-9]{64}$/.test(entries[0].sha256)) {
      throw new Error("Invalid snapshot entry.");
    }

    const path = join(input, name);

    if (
      !lstatSync(path).isFile() ||
      (await checksum(path)) !== entries[0].sha256
    ) {
      throw new Error("Snapshot checksum mismatch.");
    }

    checkDatabase(path);
  }

  return manifest;
}

/** Operator must stop writes across all stores; individual backups include committed WAL pages.
 * @param {string} output
 * @param {{quiesced?: boolean, env?: Record<string, string | undefined>, cwd?: string}} [options]
 */
export async function backupState(
  output,
  { quiesced = false, env = process.env, cwd = process.cwd() } = {},
) {
  if (!quiesced) {
    throw new Error("Stop application writes before a coordinated snapshot.");
  }

  const sources = stores.map(([name, key]) =>
    realpathSync(env[key] || join(cwd, ".igor", name)),
  );

  if (new Set(sources).size !== stores.length) {
    throw new Error("Each store must have a distinct database path.");
  }

  sources.forEach(checkDatabase);
  mkdirSync(output, { mode: 0o700 }); // Exclusive: never replace an existing backup or database.

  try {
    const files = [];

    for (let index = 0; index < stores.length; index++) {
      const name = stores[index][0];
      const target = join(output, name);
      const source = new DatabaseSync(sources[index], { readOnly: true });

      try {
        await backup(source, target);
      } finally {
        source.close();
      }

      chmodSync(target, 0o600);
      files.push({ name, sha256: await checksum(target) });
    }

    writeFileSync(
      join(output, "manifest.json"),
      JSON.stringify(
        { version: 1, at: new Date().toISOString(), files },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    await verifySnapshot(output);
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
}

/** Restore into a new directory only; the operator decides when to switch application paths. */
export async function restoreState(input, output, { quiesced = false } = {}) {
  if (!quiesced) {
    throw new Error("Stop application writes before restoring state.");
  }

  await verifySnapshot(input);
  mkdirSync(output, { mode: 0o700 });

  try {
    for (const [name] of stores) {
      const path = join(output, name);
      copyFileSync(join(input, name), path);
      chmodSync(path, 0o600);
      checkDatabase(path);
    }
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [operation, ...args] = process.argv.slice(2);

  const option = (key) => {
    const i = args.indexOf(key);

    return i < 0 ? undefined : args[i + 1];
  };

  const input = option("--input");
  const output = option("--output");
  const options = { quiesced: args.includes("--quiesced") };

  try {
    if (operation === "backup" && output) {
      await backupState(output, options);
    } else if (operation === "verify" && input) {
      await verifySnapshot(input);
    } else if (operation === "restore" && input && output) {
      await restoreState(input, output, options);
    } else {
      throw new Error(
        "Use backup --output NEW_DIR --quiesced, verify --input DIR, or restore --input DIR --output NEW_DIR --quiesced.",
      );
    }

    console.log(
      "Four-store snapshot operation completed. Database contents are private; do not upload them to CI artifacts.",
    );
  } catch {
    console.error(
      "Snapshot failed. Check store paths, quiescence, new output directory and manifest integrity. Existing files were not replaced.",
    );
    process.exitCode = 1;
  }
}
