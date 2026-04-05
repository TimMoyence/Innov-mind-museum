#!/bin/sh
set -e

echo "=== ci_post_clone.sh ==="

# Navigate to frontend root
cd "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend"

# ── Node.js 22 installation (multi-strategy for Xcode Cloud resilience) ──
# Xcode Cloud runners have intermittent DNS failures to ghcr.io (Homebrew)
# and raw.githubusercontent.com (nvm). We try multiple strategies in order.
install_node_brew() {
  echo "[Strategy 1] Installing Node.js 22 via Homebrew..."
  export HOMEBREW_NO_AUTO_UPDATE=1
  export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
  if brew list node@22 >/dev/null 2>&1 || brew install node@22; then
    export PATH="$(brew --prefix node@22)/bin:$PATH"
    return 0
  fi
  return 1
}

install_node_direct() {
  echo "[Strategy 2] Downloading Node.js 22 binary from nodejs.org..."
  local arch="arm64"
  if [ "$(uname -m)" = "x86_64" ]; then arch="x64"; fi
  local tarball="node-v22.22.0-darwin-${arch}.tar.gz"
  local url="https://nodejs.org/dist/v22.22.0/${tarball}"
  local dest="/tmp/node22"
  mkdir -p "$dest"
  if curl -fsSL --retry 3 --retry-delay 5 "$url" | tar xz -C "$dest" --strip-components=1; then
    export PATH="$dest/bin:$PATH"
    return 0
  fi
  return 1
}

use_system_node() {
  echo "[Strategy 3] Using system Node.js..."
  if command -v node >/dev/null 2>&1; then
    local ver
    ver=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$ver" -ge 18 ]; then
      echo "System Node.js v$(node -v) is >= 18, acceptable."
      return 0
    fi
    echo "System Node.js v$(node -v) is too old (need >= 18)."
  fi
  return 1
}

if ! install_node_brew; then
  echo "Homebrew failed (likely DNS issue). Trying direct download..."
  if ! install_node_direct; then
    echo "Direct download failed. Falling back to system Node.js..."
    if ! use_system_node; then
      echo "ERROR: No suitable Node.js found. Aborting."
      exit 1
    fi
  fi
fi

echo "Node: $(node -v)"
echo "npm: $(npm -v)"

# Install JS dependencies (needed for Metro bundler during build)
npm install --no-audit --no-fund

# Pods/ is committed to the repo — no pod install needed.
# If Podfile.lock changes, run `pod install` locally and commit Pods/.

# Always regenerate React Native codegen files (New Architecture).
# Even when build/generated/ is committed to git, the codegen output must
# match the exact native module versions installed by `npm install` above.
# A stale commit (e.g. missing States.cpp for a new module) causes:
#   "Build input file cannot be found" for States.cpp / ShadowNodes.cpp / *-generated.mm
echo "Regenerating React Native codegen files..."
cd "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend"
node node_modules/react-native/scripts/generate-codegen-artifacts.js \
  --path "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend" \
  --outputPath "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/build/generated" \
  --targetPlatform ios
echo "Codegen generation complete"

# Write the CI node path into .xcode.env.local so Xcode build phases
# (e.g. [CP-User] Generate Specs) find the same node binary.
NODE_PATH=$(which node)
echo "export NODE_BINARY=$NODE_PATH" > "$CI_PRIMARY_REPOSITORY_PATH/museum-frontend/ios/.xcode.env.local"
echo "Wrote .xcode.env.local: NODE_BINARY=$NODE_PATH"

echo "=== ci_post_clone.sh done ==="
