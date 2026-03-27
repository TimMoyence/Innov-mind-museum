#!/bin/sh
set -e

echo "=== ci_pre_xcodebuild.sh ==="

# Disable Sentry source map upload (no auth token in Xcode Cloud)
export SENTRY_DISABLE_AUTO_UPLOAD=true

# Source nvm so node is available during build phases
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  echo "Node (via nvm): $(node -v)"
fi

# Write .xcode.env.local so react-native-xcode.sh finds node
# (the default .xcode.env uses 'command -v node' which may miss nvm)
NODE_PATH=$(command -v node)
if [ -n "$NODE_PATH" ]; then
  echo "export NODE_BINARY=$NODE_PATH" > "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/.xcode.env.local"
  echo "Wrote .xcode.env.local with NODE_BINARY=$NODE_PATH"
fi

echo "=== ci_pre_xcodebuild.sh done ==="
