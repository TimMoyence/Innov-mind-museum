#!/bin/sh
set -e

echo "=== ci_pre_xcodebuild.sh ==="

# Source nvm so node is available during build phases
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  echo "Node (via nvm): $(node -v)"
fi

# Write .xcode.env.local — this is the ONLY way to pass env vars
# to Xcode build phase scripts (exports from ci_pre_xcodebuild.sh
# do NOT propagate to PhaseScriptExecution processes).
NODE_PATH=$(command -v node)
ENV_LOCAL="$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/.xcode.env.local"
if [ -n "$NODE_PATH" ]; then
  cat > "$ENV_LOCAL" << XENV
export NODE_BINARY="$NODE_PATH"
export SENTRY_DISABLE_AUTO_UPLOAD=true
XENV
  echo "Wrote .xcode.env.local:"
  cat "$ENV_LOCAL"
else
  echo "WARNING: node not found, .xcode.env.local not written"
fi

echo "=== ci_pre_xcodebuild.sh done ==="
