import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceScript = fileURLToPath(
  new URL("../../scripts/clean-build.mjs", import.meta.url),
);

describe("Build cleanup", () => {
  it("keeps the build directory and clears its contents", () => {
    const directory = mkdtempSync(join(tmpdir(), "igor-clean-build-"));
    const buildDirectory = join(directory, ".next");
    const script = join(directory, "scripts", "clean-build.mjs");

    try {
      mkdirSync(join(directory, "scripts"));
      copyFileSync(sourceScript, script);

      execFileSync(process.execPath, [script]);
      expect(existsSync(buildDirectory)).toBe(false);

      mkdirSync(join(buildDirectory, "cache"), { recursive: true });
      writeFileSync(join(buildDirectory, "BUILD_ID"), "previous build");
      writeFileSync(join(buildDirectory, "cache", "entry"), "cached data");

      execFileSync(process.execPath, [script]);
      expect(existsSync(buildDirectory)).toBe(true);
      expect(readdirSync(buildDirectory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("clears a mounted cache without removing its directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "igor-mounted-cache-"));
    const buildDirectory = join(directory, ".next");
    const cacheDirectory = join(buildDirectory, "cache");
    const script = join(directory, "scripts", "clean-build.mjs");
    const mountPatch = join(directory, "mounted-cache.cjs");

    try {
      mkdirSync(join(directory, "scripts"));
      copyFileSync(sourceScript, script);

      mkdirSync(join(cacheDirectory, "nested"), { recursive: true });
      writeFileSync(join(cacheDirectory, "nested", "entry"), "cached data");
      writeFileSync(join(buildDirectory, "BUILD_ID"), "previous build");

      // A real mount needs privileges; simulate its EBUSY removal error in a child process.
      writeFileSync(
        mountPatch,
        `const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const { join } = require("node:path");

const cacheDirectory = join(__dirname, ".next", "cache");
const originalRemove = fs.rmSync;
const originalRemoveDirectory = fs.rmdirSync;

function rejectMountedDirectory(path) {
  if (path === cacheDirectory) {
    const error = new Error("Device or resource busy");
    error.code = "EBUSY";
    throw error;
  }
}

fs.rmSync = (path, options) => {
  rejectMountedDirectory(path);
  return originalRemove(path, options);
};

fs.rmdirSync = (path) => {
  rejectMountedDirectory(path);
  return originalRemoveDirectory(path);
};

syncBuiltinESMExports();
`,
      );

      execFileSync(process.execPath, ["--require", mountPatch, script]);
      expect(readdirSync(buildDirectory)).toEqual(["cache"]);
      expect(readdirSync(cacheDirectory)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
