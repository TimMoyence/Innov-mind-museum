#!/usr/bin/env bash
# scripts/seed-pilot-museums.sh
#
# W4 cluster E (TE1) — C3.3 + W2.4: orchestrator for the 3 pilot museums
# (Louvre, Orsay, Pompidou) used for the launch weekend test.
#
# What it does
#   1. seed-museums (BE) — idempotent INSERT of the 3 pilot rows into
#      `museums`. Pre-existing rows are left untouched (slug UNIQUE).
#   2. catalog-ingest (BE) — runs once per pilot museum's Wikidata QID,
#      pulling ~3-7 k artworks each from Wikidata SPARQL + Wikimedia
#      thumbnails, encoding via SigLIP, persisting embeddings + metadata
#      rows. Idempotent (qid + embedding + modelVersion match = skip).
#   3. Prints a summary delta so the operator can confirm the row counts.
#
# Why a bash orchestrator rather than another .ts script
#   The existing scripts are individually invokable (`pnpm tsx
#   scripts/seed-museums.ts` and `pnpm tsx scripts/catalog-ingest.ts
#   --museum=<QID>`). Wrapping them in bash keeps the BE TypeScript
#   surface unchanged while providing a single-command launch ritual the
#   TL runs manually before the weekend test. No new TS module = no
#   new tests to maintain, no new typecheck failure surface.
#
# Pre-flight (TL must verify before running on prod)
#   - DB reachable at DATABASE_URL (or the .env vars catalog-ingest.ts
#     reads via dotenv/config).
#   - pgvector >= 0.7.0 installed (halfvec required by C3 migration).
#   - SigLIP ONNX model available locally or via the configured
#     EMBEDDINGS_BACKEND env var.
#   - Disk space: ~2-3 GB for thumbnail cache during ingest (cleaned up
#     by catalog-ingest internally).
#   - Time: 2-6 hours wall-clock total depending on rate-limit (Wikidata
#     polite limiter caps at ~1 req/s/host).
#
# Modes
#   --dry-run            print what would run, do not touch DB
#   --skip-museums       skip the seed-museums step (use when rows exist)
#   --skip-ingest        skip catalog-ingest (use to only insert museums)
#   --only=<slug>        run only one pilot (louvre / orsay / pompidou)
#
# Cross-worktree note (W3 geofence)
#   The seed-museums.ts script currently inserts (lat, lng) but not the
#   `geofence_polygon` column W3 introduces. After W3 merges, extend
#   seed-museums.ts (or a follow-up CLI flag) to populate the polygon.
#   For pre-W3 launch, the (lat, lng) point is sufficient for proximity
#   search.

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────

readonly REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly BACKEND_DIR="${REPO_ROOT}/museum-backend"

# Pilot QIDs (Wikidata) — these drive catalog-ingest's --museum= flag.
#   Q19675   = Musée du Louvre
#   Q23402   = Musée d'Orsay
#   Q193554  = Centre Pompidou
readonly -A PILOT_QIDS=(
  [louvre]="Q19675"
  [orsay]="Q23402"
  [pompidou]="Q193554"
)

readonly -A PILOT_LABELS=(
  [louvre]="Musée du Louvre"
  [orsay]="Musée d'Orsay"
  [pompidou]="Centre Pompidou"
)

# ── Flags ─────────────────────────────────────────────────────────────

DRY_RUN=0
SKIP_MUSEUMS=0
SKIP_INGEST=0
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)        DRY_RUN=1 ;;
    --skip-museums)   SKIP_MUSEUMS=1 ;;
    --skip-ingest)    SKIP_INGEST=1 ;;
    --only=*)         ONLY="${1#--only=}" ;;
    -h|--help)
      sed -n '2,40p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 2
      ;;
  esac
  shift
done

# ── Helpers ───────────────────────────────────────────────────────────

log() { printf '[seed-pilot-museums] %s\n' "$*"; }

run() {
  if (( DRY_RUN )); then
    log "DRY-RUN >> $*"
  else
    log "RUN     >> $*"
    "$@"
  fi
}

# Validates ONLY against the known set BEFORE any side effects.
if [[ -n "${ONLY}" && -z "${PILOT_QIDS[${ONLY}]+x}" ]]; then
  echo "ERROR --only=${ONLY} is not a known pilot. Valid: ${!PILOT_QIDS[*]}" >&2
  exit 2
fi

# ── Pre-flight ────────────────────────────────────────────────────────

log "Repo root: ${REPO_ROOT}"
log "Backend dir: ${BACKEND_DIR}"
log "Dry-run: ${DRY_RUN} · skip-museums: ${SKIP_MUSEUMS} · skip-ingest: ${SKIP_INGEST} · only: ${ONLY:-(all)}"

if [[ ! -d "${BACKEND_DIR}" ]]; then
  echo "ERROR backend dir not found: ${BACKEND_DIR}" >&2
  exit 1
fi
if [[ ! -f "${BACKEND_DIR}/package.json" ]]; then
  echo "ERROR backend package.json missing — wrong checkout?" >&2
  exit 1
fi

# Sanity check: catalog-ingest.ts entry exists.
if [[ ! -f "${BACKEND_DIR}/scripts/catalog-ingest.ts" ]]; then
  echo "ERROR catalog-ingest.ts not found at expected path" >&2
  exit 1
fi
if [[ ! -f "${BACKEND_DIR}/scripts/seed-museums.ts" ]]; then
  echo "ERROR seed-museums.ts not found at expected path" >&2
  exit 1
fi

# ── Step 1: insert museum rows ────────────────────────────────────────

if (( SKIP_MUSEUMS )); then
  log "Skipping seed-museums step (--skip-museums)"
else
  log "Step 1/2: seeding museum rows (idempotent)"
  (
    cd "${BACKEND_DIR}"
    run pnpm exec tsx scripts/seed-museums.ts
  )
  log "Museum rows seeded."
fi

# ── Step 2: catalog ingest per pilot ──────────────────────────────────

if (( SKIP_INGEST )); then
  log "Skipping catalog-ingest step (--skip-ingest)"
else
  for slug in louvre orsay pompidou; do
    if [[ -n "${ONLY}" && "${ONLY}" != "${slug}" ]]; then
      continue
    fi
    qid="${PILOT_QIDS[$slug]}"
    label="${PILOT_LABELS[$slug]}"
    log "Step 2/2 [${slug}]: catalog-ingest ${label} (${qid})"
    (
      cd "${BACKEND_DIR}"
      run pnpm exec tsx scripts/catalog-ingest.ts \
        --museum="${qid}" \
        --license-filter=public-domain,cc-0
    )
    log "Done [${slug}]"
  done
fi

# ── Summary ───────────────────────────────────────────────────────────

if (( DRY_RUN )); then
  log "Dry-run complete — no DB writes performed."
  exit 0
fi

log "All steps completed."
log "Next steps (manual):"
log "  - psql \\dt+ museums to confirm row count"
log "  - psql 'SELECT museum_id, count(*) FROM artwork_embeddings GROUP BY 1' for ingest delta"
log "  - smoke-test the FE 'find museums near me' against the new rows"
log "  - escalate to TL if any row count looks wrong before the weekend launch"
