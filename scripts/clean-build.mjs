import { existsSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const buildDirectory = fileURLToPath(new URL("../.next/", import.meta.url));

function clearDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (!entry.isDirectory()) {
      rmSync(entryPath, { force: true });
      continue;
    }

    clearDirectory(entryPath);

    try {
      rmdirSync(entryPath);
    } catch (error) {
      // Mounted directories cannot be removed, even after their contents are cleared.
      if (error.code !== "EBUSY") {
        throw error;
      }
    }
  }
}

if (existsSync(buildDirectory)) {
  clearDirectory(buildDirectory);
}
