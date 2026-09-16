#!/usr/bin/env bash
# Bring up a Toxiproxy shaped link in front of a running backend.
#
#   app → :3100 (shaped listener) → toxiproxy → :3000 (backend)
#
# Usage: toxiproxy-up.sh [profile]
#   profile ∈ offline | 2g | edge | 3g-lossy | flapping | normal   (default: edge)
#
# Runs Toxiproxy NATIVELY (brew), not in Docker: GitHub's macOS runners ship
# without Docker — the same reason the iOS job provisions Postgres/Redis through
# Homebrew. The Android weak-net job uses the containerised Toxiproxy; this is its
# macOS equivalent, seeded from the SAME ratified profile so the two platforms
# shape identically (scripts/net-shaping/profile-to-toxics.mjs is the single
# source of truth for the toxics).
#
# Fails LOUD at every step. A weak-net suite whose proxy silently didn't come up
# is worse than no suite: the flows pass, having shaped nothing, and we call it
# coverage.
set -euo pipefail

PROFILE="${1:-edge}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
ADMIN="http://localhost:8474"
PROXY_NAME="musaium"
LISTEN="127.0.0.1:3100"
UPSTREAM="127.0.0.1:3000"

command -v toxiproxy-server >/dev/null 2>&1 || {
  echo "[toxi] toxiproxy-server not found — install it (brew install toxiproxy)" >&2
  exit 1
}

# 1. Server (idempotent — reuse one that is already up)
if ! curl -sf "$ADMIN/version" >/dev/null 2>&1; then
  echo "[toxi] starting toxiproxy-server…"
  nohup toxiproxy-server >/tmp/toxiproxy-server.log 2>&1 &
  for _ in $(seq 1 40); do
    curl -sf "$ADMIN/version" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi
curl -sf "$ADMIN/version" >/dev/null || {
  echo "[toxi] server never came up — see /tmp/toxiproxy-server.log" >&2
  exit 1
}
echo "[toxi] server up ($(curl -s "$ADMIN/version"))"

# 2. Proxy (recreate clean so a stale toxic set can never leak between runs)
curl -sf -X DELETE "$ADMIN/proxies/$PROXY_NAME" >/dev/null 2>&1 || true
curl -sf -X POST "$ADMIN/proxies" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$PROXY_NAME\",\"listen\":\"$LISTEN\",\"upstream\":\"$UPSTREAM\",\"enabled\":true}" \
  >/dev/null || { echo "[toxi] could not create the proxy" >&2; exit 1; }
echo "[toxi] proxy $PROXY_NAME: $LISTEN → $UPSTREAM"

# 3. Toxics, derived from the ratified network profile
node "$REPO_ROOT/scripts/net-shaping/profile-to-toxics.mjs" "$PROFILE" | node -e '
const toxics = JSON.parse(require("fs").readFileSync(0, "utf8"));
(async () => {
  for (const t of toxics) {
    const r = await fetch("http://localhost:8474/proxies/musaium/toxics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    if (!r.ok) {
      console.error("[toxi] toxic FAILED:", t.name, await r.text());
      process.exit(1);
    }
    console.log("[toxi] toxic:", t.name, JSON.stringify(t.attributes));
  }
})();
'

# 4. Assert the shaped link genuinely answers — never a silent no-op
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 45 "http://localhost:3100/api/health" || echo 000)
echo "[toxi] shaped /api/health → $CODE (profile=$PROFILE)"
[ "$CODE" = "200" ] || {
  echo "[toxi] the shaped link is NOT healthy — refusing to run a weak-net suite that shapes nothing" >&2
  exit 1
}
