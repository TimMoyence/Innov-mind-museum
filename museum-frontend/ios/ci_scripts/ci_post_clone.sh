#!/bin/sh
set -e

echo "=== ci_post_clone.sh ==="

# Disable Sentry source map upload (no auth token in Xcode Cloud)
export SENTRY_DISABLE_AUTO_UPLOAD=true

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

# Install JS dependencies
npm install

# Install CocoaPods dependencies
cd ios
pod install

echo "=== ci_post_clone.sh done ==="
