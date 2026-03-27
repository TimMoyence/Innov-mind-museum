#!/bin/sh
# Runs before xcodebuild — env vars here ARE available during the build
export SENTRY_DISABLE_AUTO_UPLOAD=true
echo "SENTRY_DISABLE_AUTO_UPLOAD=true (no auth token in Xcode Cloud)"
