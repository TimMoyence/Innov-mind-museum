#!/usr/bin/env bash
# Verifies that SUPPORTED_LOCALES arrays are identical in backend and frontend.
# Prevents locale drift between the two independent apps.
set -euo pipefail

BACKEND_FILE="museum-backend/src/shared/i18n/locale.ts"
FRONTEND_FILE="museum-frontend/shared/config/supportedLocales.ts"

extract_locales() {
  sed -n "s/.*SUPPORTED_LOCALES *= *\[\([^]]*\)\].*/\1/p" "$1" \
    | tr -d "' \"" \
    | tr ',' '\n' \
    | sed '/^$/d' \
    | sort
}

BACKEND_LOCALES=$(extract_locales "$BACKEND_FILE")
FRONTEND_LOCALES=$(extract_locales "$FRONTEND_FILE")

if [ "$BACKEND_LOCALES" != "$FRONTEND_LOCALES" ]; then
  echo "SUPPORTED_LOCALES mismatch between backend and frontend!"
  echo ""
  echo "Backend ($BACKEND_FILE):"
  echo "$BACKEND_LOCALES"
  echo ""
  echo "Frontend ($FRONTEND_FILE):"
  echo "$FRONTEND_LOCALES"
  exit 1
fi

echo "SUPPORTED_LOCALES are in sync."
