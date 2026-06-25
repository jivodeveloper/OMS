const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");

const patches = [
  {
    file: "node_modules/react-native-screens/android/CMakeLists.txt",
    anchor:
      "            ReactAndroid::reactnative\n            ReactAndroid::jsi\n            fbjni::fbjni\n            android",
    replacement:
      "            ReactAndroid::reactnative\n            ReactAndroid::jsi\n            fbjni::fbjni\n            android\n            c++_shared",
  },
  {
    file: "node_modules/react-native-screens/android/src/main/jni/CMakeLists.txt",
    anchor: "    ReactAndroid::reactnative\n    ReactAndroid::jsi\n    fbjni::fbjni",
    replacement:
      "    ReactAndroid::reactnative\n    ReactAndroid::jsi\n    fbjni::fbjni\n    c++_shared",
  },
  {
    file: "node_modules/react-native-svg/android/src/main/jni/CMakeLists.txt",
    anchor: "    ReactAndroid::reactnative\n    ReactAndroid::jsi",
    replacement: "    ReactAndroid::reactnative\n    ReactAndroid::jsi\n    c++_shared",
  },
  {
    file: "node_modules/react-native-keyboard-controller/android/src/main/jni/CMakeLists.txt",
    anchor: "    ReactAndroid::reactnative\n    ReactAndroid::jsi\n    fbjni::fbjni",
    replacement:
      "    ReactAndroid::reactnative\n    ReactAndroid::jsi\n    fbjni::fbjni\n    c++_shared",
  },
  {
    file: "node_modules/react-native-worklets/android/CMakeLists.txt",
    anchor: "target_link_libraries(worklets log ReactAndroid::jsi fbjni::fbjni)",
    replacement:
      "target_link_libraries(worklets log ReactAndroid::jsi fbjni::fbjni c++_shared)",
  },
  {
    file: "node_modules/expo-modules-core/android/CMakeLists.txt",
    anchor:
      "  ReactAndroid::jsi\n  android\n  ${JSEXECUTOR_LIB}\n  ${NEW_ARCHITECTURE_DEPENDENCIES}",
    replacement:
      "  ReactAndroid::jsi\n  android\n  c++_shared\n  ${JSEXECUTOR_LIB}\n  ${NEW_ARCHITECTURE_DEPENDENCIES}",
  },
  {
    file: "node_modules/react-native-reanimated/android/CMakeLists.txt",
    anchor:
      "target_link_libraries(reanimated log ReactAndroid::jsi fbjni::fbjni android\n                      worklets)",
    replacement:
      "target_link_libraries(reanimated log ReactAndroid::jsi fbjni::fbjni android\n                      c++_shared worklets)",
  },
];

for (const patch of patches) {
  const filePath = path.join(projectRoot, patch.file);

  if (!fs.existsSync(filePath)) {
    continue;
  }

  const source = fs.readFileSync(filePath, "utf8");

  if (source.includes(patch.replacement)) {
    continue;
  }

  if (!source.includes(patch.anchor)) {
    throw new Error(`Could not patch ${patch.file}: anchor not found`);
  }

  fs.writeFileSync(filePath, source.replace(patch.anchor, patch.replacement));
}

function walk(dir, visit) {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, visit);
    } else {
      visit(fullPath);
    }
  }
}

walk(path.join(projectRoot, "node_modules"), (filePath) => {
  const normalizedPath = filePath.replace(/\\/g, "/");

  if (!normalizedPath.endsWith("/android/build/generated/source/codegen/jni/CMakeLists.txt")) {
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");

  if (source.includes("  c++_shared\n")) {
    return;
  }

  if (!source.includes("  reactnative\n)")) {
    return;
  }

  fs.writeFileSync(
    filePath,
    source.replace("  reactnative\n)", "  reactnative\n  c++_shared\n)"),
  );
});
