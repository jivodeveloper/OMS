/**
 * Lets `node --test` load TypeScript modules that import their siblings.
 *
 * Node's native type-stripping runs the files as ES modules, and ESM resolution
 * is exact: `import "./constants"` is a missing file, not a hint to try
 * `./constants.ts`. Every test in this repo so far covered a module with no
 * relative imports at all, so this never came up; the Advance Payment rules are
 * several modules that import each other (as they are on the web, where the
 * bundler resolves them), and without this hook they cannot be tested here.
 *
 * TEST-ONLY. Metro and `tsc` already resolve these specifiers, so nothing in the
 * app depends on this file — it exists so the test runner agrees with them.
 */
import { existsSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

/** Registered into this same process: the hook runs on a worker thread. */
register(import.meta.url, { data: null });

const CANDIDATES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/**
 * The project root, for the `@/` alias below.
 *
 * `scripts/testResolver.mjs` -> the directory above `scripts`, which is what
 * `tsconfig.json` points `@/*` at. Derived rather than written out so moving
 * this file does not silently resolve every alias to the wrong tree.
 */
const PROJECT_ROOT = new URL("../", import.meta.url);

export function resolve(specifier, context, nextResolve) {
  // `@/src/...` — the alias tsconfig and Metro both understand and Node does
  // not. Without this, any module reachable only through an aliased import is
  // untestable here, which is why the permission rules went so long with no
  // test over them. Rewritten to a path, then fed through the same extension
  // search as a relative specifier below.
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), PROJECT_ROOT);
    for (const suffix of ["", ...CANDIDATES]) {
      const candidate = new URL(base.href + suffix);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
  }

  // Only bare relative specifiers with no extension of their own.
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const parent = context.parentURL;
    if (parent?.startsWith("file:")) {
      const base = new URL(specifier, parent);
      for (const suffix of CANDIDATES) {
        const candidate = new URL(base.href + suffix);
        if (existsSync(fileURLToPath(candidate))) {
          // No `format`: leaving it to Node is what keeps type-stripping on.
          return { url: candidate.href, shortCircuit: true };
        }
      }
    }
  }
  return nextResolve(specifier, context);
}
