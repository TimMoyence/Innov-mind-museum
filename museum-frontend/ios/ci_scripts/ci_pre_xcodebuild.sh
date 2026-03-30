#!/bin/sh

echo "=== ci_pre_xcodebuild.sh ==="

# Ensure Homebrew-installed Node.js 22 is on PATH
# (installed by ci_post_clone.sh via brew install node@22)
BREW_NODE_PREFIX="$(brew --prefix node@22 2>/dev/null || true)"
if [ -n "$BREW_NODE_PREFIX" ] && [ -d "$BREW_NODE_PREFIX/bin" ]; then
  export PATH="$BREW_NODE_PREFIX/bin:$PATH"
  echo "Node (via Homebrew): $(node -v || echo 'NOT FOUND')"
fi

# Write .xcode.env.local — this is the ONLY way to pass env vars
# to Xcode build phase scripts (exports from ci_pre_xcodebuild.sh
# do NOT propagate to PhaseScriptExecution processes).
NODE_PATH=$(command -v node || true)
ENV_LOCAL="$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/.xcode.env.local"

# Always write the file — SENTRY_DISABLE_AUTO_UPLOAD is needed even
# if Node resolution fails (to prevent Sentry upload phase from crashing)
cat > "$ENV_LOCAL" << XENV
export SENTRY_DISABLE_AUTO_UPLOAD=true
XENV

if [ -n "$NODE_PATH" ]; then
  # Prepend NODE_BINARY to the file (before SENTRY line)
  cat > "$ENV_LOCAL" << XENV
export NODE_BINARY="$NODE_PATH"
export SENTRY_DISABLE_AUTO_UPLOAD=true
XENV
  echo "Wrote .xcode.env.local with NODE_BINARY=$NODE_PATH"
else
  echo "WARNING: node not found — .xcode.env.local has SENTRY_DISABLE only"
fi

cat "$ENV_LOCAL"

# Set build number from Xcode Cloud's auto-incrementing CI_BUILD_NUMBER.
# Without this, CFBundleVersion stays "1" (hardcoded in Info.plist) and
# App Store Connect silently rejects duplicate uploads → nothing on TestFlight.
if [ -n "$CI_BUILD_NUMBER" ]; then
  cd "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios"
  agvtool new-version -all "$CI_BUILD_NUMBER"
  echo "Set CFBundleVersion (build number) to $CI_BUILD_NUMBER"
else
  echo "WARNING: CI_BUILD_NUMBER not set — build number unchanged"
fi

# Patch expo-configure-project.sh — pod install embeds absolute paths
# from the dev machine, which break on Xcode Cloud. Replace with $PODS_ROOT.
EXPO_SCRIPT="$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/Pods/Target Support Files/Pods-Musaium/expo-configure-project.sh"
if [ -f "$EXPO_SCRIPT" ]; then
  sed -i '' \
    -e 's|--target "[^"]*ios/Pods/|--target "${PODS_ROOT}/|' \
    -e 's|--entitlement "[^"]*ios/|--entitlement "${PODS_ROOT}/../|' \
    "$EXPO_SCRIPT"
  echo "Patched expo-configure-project.sh with PODS_ROOT-relative paths"
fi

echo "=== ci_pre_xcodebuild.sh done ==="
