#!/bin/sh
set -e

echo "=== ci_post_clone.sh ==="

# Navigate to frontend root
cd "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend"

# Install Node.js 22 — Homebrew is pre-installed on Xcode Cloud.
# We avoid nvm because its install script downloads from raw.githubusercontent.com
# which intermittently fails DNS resolution on Xcode Cloud machines.
echo "Installing Node.js 22 via Homebrew..."
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
if ! brew list node@22 >/dev/null 2>&1; then
  brew install node@22
fi
export PATH="$(brew --prefix node@22)/bin:$PATH"

echo "Node: $(node -v)"
echo "npm: $(npm -v)"

# Install JS dependencies (needed for Metro bundler during build)
npm install --no-audit --no-fund

# Pods/ is committed to the repo — no pod install needed.
# If Podfile.lock changes, run `pod install` locally and commit Pods/.

# Regenerate React Native codegen files (New Architecture)
# These live in ios/build/generated/ and may be stale or missing if
# the gitignore wasn't updated. This ensures they're always fresh.
cd "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios"
if [ ! -f "build/generated/ios/ReactCodegen.podspec" ]; then
  echo "Codegen files missing — regenerating..."
  cd "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend"
  node node_modules/react-native/scripts/generate-codegen-artifacts.js \
    --path "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend" \
    --outputPath "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/build/generated" \
    --targetPlatform ios
  echo "Codegen generation complete"
else
  echo "Codegen files present — skipping regeneration"
fi

echo "=== ci_post_clone.sh done ==="
