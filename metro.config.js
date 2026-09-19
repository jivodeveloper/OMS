/**
 * Keep test files out of the native bundle.
 *
 * Expo Router discovers routes with `require.context` over `app/`, which pulls
 * in EVERY file under that directory — not only the ones a screen imports. A
 * `.test.ts` file there is therefore bundled for the device, and the moment it
 * imports `node:assert` or `node:test` the Android build fails outright:
 *
 *     You attempted to import the Node standard library module
 *     "node:assert/strict" from "app/.../methodPayload.test.ts".
 *
 * The `_` prefix on a folder stops a file becoming a ROUTE; it does not stop it
 * being bundled. Tests belong in `src/`, which Metro only reaches through real
 * imports — but a test placed under `app/` by mistake breaks the build rather
 * than failing a test, which is a bad way to find out. This blocks them.
 */
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList].filter(Boolean)),
  /.*\.test\.(ts|tsx|js|jsx)$/,
];

module.exports = config;
