#!/bin/sh

echo "=== ci_pre_xcodebuild.sh ==="

BREW_NODE_PREFIX="$(brew --prefix node@22 2>/dev/null || true)"
if [ -n "$BREW_NODE_PREFIX" ] && [ -d "$BREW_NODE_PREFIX/bin" ]; then
  export PATH="$BREW_NODE_PREFIX/bin:$PATH"
  echo "Node (via Homebrew): $(node -v || echo 'NOT FOUND')"
fi

NODE_PATH=$(command -v node || true)
ENV_LOCAL="$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/.xcode.env.local"

cat > "$ENV_LOCAL" << XENV
export SENTRY_DISABLE_AUTO_UPLOAD=true
XENV

if [ -n "$NODE_PATH" ]; then
  cat > "$ENV_LOCAL" << XENV
export NODE_BINARY="$NODE_PATH"
export SENTRY_DISABLE_AUTO_UPLOAD=true
XENV
  echo "Wrote .xcode.env.local with NODE_BINARY=$NODE_PATH"
else
  echo "WARNING: node not found — .xcode.env.local has SENTRY_DISABLE only"
fi

cat "$ENV_LOCAL"

MARKETING_VERSION=$(node -p "require('$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/package.json').version")
plutil -replace CFBundleShortVersionString -string "$MARKETING_VERSION" "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/Musaium/Info.plist"
echo "Set CFBundleShortVersionString to $MARKETING_VERSION (from package.json)"

PLIST_PATH="$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/Musaium/Info.plist"
PLIST_FLOOR=$(plutil -extract CFBundleVersion raw "$PLIST_PATH" 2>/dev/null || echo "1")

if [ -n "$CI_BUILD_NUMBER" ] && [ "$CI_BUILD_NUMBER" -gt "$PLIST_FLOOR" ]; then
  TARGET_BUILD="$CI_BUILD_NUMBER"
else
  TARGET_BUILD="$PLIST_FLOOR"
fi

cd "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios"
agvtool new-version -all "$TARGET_BUILD"
echo "Set CFBundleVersion to $TARGET_BUILD (plist floor=$PLIST_FLOOR, CI_BUILD_NUMBER=${CI_BUILD_NUMBER:-unset})"

for XCCONFIG in \
  "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/Pods/Target Support Files/Pods-Musaium/Pods-Musaium.debug.xcconfig" \
  "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/Pods/Target Support Files/Pods-Musaium/Pods-Musaium.release.xcconfig"; do
  if [ -f "$XCCONFIG" ]; then
    sed -i '' 's|HERMES_CLI_PATH = /.*hermesc$|HERMES_CLI_PATH = $(PODS_ROOT)/hermes-engine/destroot/bin/hermesc|' "$XCCONFIG"
    echo "Patched HERMES_CLI_PATH in $(basename "$XCCONFIG")"
  fi
done

EXPO_SCRIPT="$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/Pods/Target Support Files/Pods-Musaium/expo-configure-project.sh"
if [ -f "$EXPO_SCRIPT" ]; then
  sed -i '' \
    -e 's|--target "[^"]*ios/Pods/|--target "${PODS_ROOT}/|' \
    -e 's|--entitlement "[^"]*ios/|--entitlement "${PODS_ROOT}/../|' \
    "$EXPO_SCRIPT"
  echo "Patched expo-configure-project.sh with PODS_ROOT-relative paths"
fi

echo "=== ci_pre_xcodebuild.sh done ==="
