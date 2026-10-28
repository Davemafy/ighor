import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

const destination = new URL("../public/marketing/vendor/", import.meta.url);
await mkdir(destination, { recursive: true });

for (const [source, target] of [
  ["gsap/dist/gsap.min.js", "gsap.min.js"],
  ["gsap/dist/ScrollTrigger.min.js", "ScrollTrigger.min.js"],
  ["gsap/package.json", "GSAP-PACKAGE.json"],
  ["lenis/dist/lenis.min.js", "lenis.min.js"],
  ["lenis/dist/lenis.css", "lenis.css"],
  ["lenis/LICENSE", "LENIS-LICENSE.txt"],
  ["@fontsource/anton/files/anton-latin-400-normal.woff2", "anton-latin.woff2"],
  ["@fontsource/anton/LICENSE", "ANTON-LICENSE.txt"],
]) {
  await copyFile(
    new URL(`../node_modules/${source}`, import.meta.url),
    new URL(target, destination),
  );
}

const source = await readFile(
  new URL("../src/lib/brand-audio.ts", import.meta.url),
  "utf8",
);
await writeFile(
  new URL("brand-audio.js", destination),
  transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText,
);
