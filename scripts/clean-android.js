/**
 * Delete the Android native build caches.
 *
 * Use this INSTEAD of `gradlew clean`, which cannot be trusted here.
 *
 * Why: `clean` runs `externalNativeBuildClean*`, and ninja re-runs CMake
 * before it will delete anything. The generated
 * `app/build/generated/autolinking/.../Android-autolinking.cmake` points at
 * `node_modules/<lib>/android/build/generated/source/codegen/jni/` for every
 * autolinked library. Those directories are produced by each library's own
 * build and disappear whenever node_modules is reinstalled -- at which point
 * `clean` fails with
 *
 *     add_subdirectory given source "..." which is not an existing directory
 *
 * and the project can be neither cleaned NOR built until the stale `.cxx` is
 * removed by hand. Deleting outright has no such ordering problem: there is
 * nothing to configure, so nothing to fail.
 *
 * Removes the app's caches AND the per-library ones under node_modules. The
 * library `.cxx` folders hold the same stale references, and missing them is
 * what made an earlier attempt at this fix incomplete.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const removed = [];
const locked = [];

function rm(target) {
  if (!fs.existsSync(target)) return;
  try {
    // Retries cover the usual Windows case of a file scanner or an editor
    // holding a handle for a moment.
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    removed.push(path.relative(root, target));
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EBUSY") {
      // Almost always the Gradle daemon: it holds android/.gradle open for its
      // whole life, so this cannot be cleaned while a build is running. Collect
      // and report rather than dying half-done, which would leave exactly the
      // inconsistent state this script exists to prevent.
      locked.push(path.relative(root, target));
      return;
    }
    throw error;
  }
}

// The app project itself.
for (const rel of ["android/app/.cxx", "android/app/build", "android/build", "android/.gradle"]) {
  rm(path.join(root, rel));
}

// Every autolinked library that carries a native build.
function sweep(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkg = path.join(dir, entry.name);
    // Scoped packages (@scope/name) nest one level deeper.
    if (entry.name.startsWith("@")) {
      sweep(pkg);
      continue;
    }
    rm(path.join(pkg, "android", ".cxx"));
    rm(path.join(pkg, "android", "build"));
  }
}
const modules = path.join(root, "node_modules");
if (fs.existsSync(modules)) sweep(modules);

console.log(
  removed.length
    ? "Removed " + removed.length + " native build directory/ies."
    : "Already clean.",
);

if (locked.length) {
  console.error(
    [
      "",
      "Could not remove " + locked.length + " locked directory/ies:",
      ...locked.map((d) => "  " + d),
      "",
      "A Gradle build is almost certainly still running. Stop it with",
      "  cd android && ./gradlew --stop",
      "then run this again.",
    ].join(String.fromCharCode(10)),
  );
  process.exit(1);
}
