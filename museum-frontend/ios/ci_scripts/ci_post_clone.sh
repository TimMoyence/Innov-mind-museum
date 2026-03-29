#!/bin/sh
set -e

echo "=== ci_post_clone.sh ==="

# Navigate to frontend root
cd "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend"

# Install Node.js via nvm (Xcode Cloud doesn't have it by default)
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
  echo "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22

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
