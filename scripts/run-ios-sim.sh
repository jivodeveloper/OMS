#!/bin/zsh
# Build and run on the iOS Simulator without `expo run:ios`.
# Xcode 27 no longer ships a standalone Simulator.app, which `expo run:ios` (Expo 54) requires.
set -e

cd "$(dirname "$0")/.."
export LANG=en_US.UTF-8

BUNDLE_ID="com.jivo.oms"
DEVICE_NAME="${1:-iPhone 18 Pro}"

UDID=$(xcrun simctl list devices available | grep -E "^\s+${DEVICE_NAME} \(" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
if [ -z "$UDID" ]; then
  echo "Simulator '${DEVICE_NAME}' not found. Available:"
  xcrun simctl list devices available | grep -i iphone
  exit 1
fi

echo "› Booting ${DEVICE_NAME} (${UDID})"
xcrun simctl boot "$UDID" 2>/dev/null || true

echo "› Building (first build takes several minutes)"
xcodebuild -workspace ios/OMSAPP.xcworkspace -scheme OMSAPP -configuration Debug \
  -destination "id=${UDID}" -derivedDataPath ios/build -quiet

echo "› Installing and launching"
xcrun simctl install "$UDID" ios/build/Build/Products/Debug-iphonesimulator/OMSAPP.app

# Point the dev client at Metro once it's listening.
(
  until curl -s http://localhost:8081/status | grep -q running; do sleep 1; done
  xcrun simctl openurl "$UDID" "exp+omsapp://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
) &

npx expo start --dev-client
