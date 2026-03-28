#!/bin/sh

echo "=== ci_pre_xcodebuild.sh ==="

# Source nvm so node is available during build phases
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  echo "Node (via nvm): $(node -v || echo 'NOT FOUND')"
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
echo "=== ci_pre_xcodebuild.sh done ==="
