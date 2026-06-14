#!/usr/bin/env bash
# pull-siglip-model.sh — fetch the SigLIP-2 ONNX into ./models for LOCAL dev.
#
# Production gets the model via `COPY --from` the pinned GHCR base image
# (deploy/Dockerfile.prod). This script gives a developer the same file locally
# by extracting it from that exact base image — so dev and prod load byte-
# identical weights, with no dependency on any external object store. This
# replaces the retired fetch-models.sh + its never-provisioned GCS bucket.
#
# Usage:    bash scripts/pull-siglip-model.sh
# Requires: docker (logged in to ghcr.io if the base image is private).
# Override: SIGLIP_BASE_IMAGE, SIGLIP_ONNX_DEST.
set -euo pipefail

BASE_IMAGE="${SIGLIP_BASE_IMAGE:-ghcr.io/timmoyence/museum-backend-base:siglip-v1}"
MODEL_IN_IMAGE="/models/siglip2-base-patch16-224.onnx"
DEST="${SIGLIP_ONNX_DEST:-./models/siglip2-base-patch16-224.onnx}"
EXPECTED_SHA256="c0573e3f4140c3a7c4e9cc5912bd6b26a033b46a6a8e8af26cbea262b163bcad"

sha_of() { shasum -a 256 "$1" | awk '{print $1}'; }

mkdir -p "$(dirname "$DEST")"

if [[ -f "$DEST" ]] && [[ "$(sha_of "$DEST")" == "$EXPECTED_SHA256" ]]; then
  echo "pull-siglip-model: $DEST already present and sha256 matches — skipping."
  exit 0
fi

echo "pull-siglip-model: pulling $BASE_IMAGE ..."
docker pull "$BASE_IMAGE"

# `FROM scratch` has no CMD; `docker create` records an (unused) command without
# validating it — the container is never started, we only `docker cp` out of it.
cid="$(docker create "$BASE_IMAGE" noop)"
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT
docker cp "${cid}:${MODEL_IN_IMAGE}" "$DEST"

actual="$(sha_of "$DEST")"
if [[ "$actual" != "$EXPECTED_SHA256" ]]; then
  echo "pull-siglip-model: sha256 mismatch (expected=$EXPECTED_SHA256, actual=$actual)" >&2
  exit 1
fi
echo "pull-siglip-model: success -> $DEST (sha256 verified)."
