#!/usr/bin/env bash
# fetch-models.sh — idempotent fetch of large ML model artefacts at Docker build time.
#
# Currently pulls the SigLIP-2 base patch16-224 ONNX bundle used by the
# `siglip-onnx` adapter (`EmbeddingsPort` / `/chat/compare`). The model is
# ~340MB and must NOT live in git; we stream it from a public GCS bucket
# during the builder stage of `museum-backend/deploy/Dockerfile.prod`.
#
# Behaviour:
#   1. If the target file is already present AND (no expected SHA256 set OR
#      the recorded SHA256 matches), exit 0 — nothing to do (idempotent).
#   2. Otherwise download to <DEST>.partial, verify SHA256 if requested, then
#      atomically rename to <DEST>.
#   3. On any verification or download failure, exit non-zero so the Docker
#      build fails loudly rather than producing an image with a corrupt model.
#
# Env vars:
#   SIGLIP_ONNX_URL    — (optional) override the default GCS URL.
#   SIGLIP_ONNX_DEST   — (optional) override the default output path.
#   SIGLIP_ONNX_SHA256 — (optional) hex-encoded sha256 for integrity check.
#                        When unset, the file is accepted as-is (acceptable
#                        until the bucket is provisioned and a canonical hash
#                        is published; tracked in the T1.4 PARTIAL note).
#
# Bucket-not-provisioned tolerance (2026-05-10):
#   When the URL returns 404 AND no SIGLIP_ONNX_SHA256 is configured, the
#   script logs a warning and exits 0 instead of failing the Docker build.
#   Rationale: the C3 visual-similarity feature has a managed fallback
#   (`EMBEDDINGS_PROVIDER=replicate`) that doesn't need this artifact, and
#   blocking every prod deploy until ops provisions the bucket would also
#   block unrelated backend changes (RBAC fixes, security patches, etc.).
#   Once SIGLIP_ONNX_SHA256 is set in CI/CD, ANY failure (404 or hash drift)
#   becomes fail-loud again — the SHA being set is the explicit signal that
#   the bucket is ready for production use.
#
# TODO(ops): provision the `musaium-models-public` GCS bucket and upload the
# ONNX bundle exported via:
#   optimum-cli export onnx --model google/siglip2-base-patch16-224 ./models/siglip2-base-patch16-224
# Then publish the canonical SHA256 and propagate it to CI/CD secrets so this
# script can refuse drift.

set -euo pipefail

DEFAULT_URL="https://storage.googleapis.com/musaium-models-public/siglip2-base-patch16-224.onnx"
DEFAULT_DEST="./models/siglip2-base-patch16-224.onnx"

URL="${SIGLIP_ONNX_URL:-$DEFAULT_URL}"
DEST="${SIGLIP_ONNX_DEST:-$DEFAULT_DEST}"
EXPECTED_SHA256="${SIGLIP_ONNX_SHA256:-}"

DEST_DIR="$(dirname "$DEST")"
mkdir -p "$DEST_DIR"

# Fast-path: file present and matches recorded hash (or no hash configured).
if [ -f "$DEST" ]; then
  if [ -z "$EXPECTED_SHA256" ]; then
    echo "fetch-models: $DEST already present, no SIGLIP_ONNX_SHA256 set — skipping download."
    exit 0
  fi
  ACTUAL=$(sha256sum "$DEST" | awk '{print $1}')
  if [ "$ACTUAL" = "$EXPECTED_SHA256" ]; then
    echo "fetch-models: $DEST present and sha256 matches — skipping download."
    exit 0
  fi
  echo "fetch-models: $DEST present but sha256 drift (expected=$EXPECTED_SHA256, actual=$ACTUAL) — re-downloading."
  rm -f "$DEST"
fi

PARTIAL="$DEST.partial"
echo "fetch-models: downloading $URL -> $DEST"

# `curl --fail` returns non-zero on HTTP 4xx/5xx; `--retry 3 --retry-all-errors`
# covers transient failures during a large download.
if ! curl --fail --silent --show-error --location \
        --retry 3 --retry-all-errors --retry-delay 2 \
        --output "$PARTIAL" "$URL"; then
  rm -f "$PARTIAL"
  if [ -z "$EXPECTED_SHA256" ]; then
    # Bucket-not-provisioned tolerance — see header docstring. The runtime
    # adapter selection (`EMBEDDINGS_PROVIDER`) controls whether siglip-onnx
    # is attempted at all; without this artefact the `replicate` fallback
    # remains usable.
    echo "fetch-models: WARNING — download failed (URL=$URL) but no SIGLIP_ONNX_SHA256 set; skipping (bucket-not-provisioned tolerance)."
    exit 0
  fi
  echo "fetch-models: download failed (URL=$URL)"
  exit 1
fi

if [ -n "$EXPECTED_SHA256" ]; then
  ACTUAL=$(sha256sum "$PARTIAL" | awk '{print $1}')
  if [ "$ACTUAL" != "$EXPECTED_SHA256" ]; then
    echo "fetch-models: sha256 mismatch (expected=$EXPECTED_SHA256, actual=$ACTUAL)"
    rm -f "$PARTIAL"
    exit 1
  fi
  echo "fetch-models: sha256 verified."
fi

mv "$PARTIAL" "$DEST"
echo "fetch-models: success -> $DEST"
