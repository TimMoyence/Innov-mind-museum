# museum-backend SigLIP model base image
# =======================================
# Owns the SigLIP-2 vision-encoder ONNX as a versioned, pullable GHCR layer so
# the production image gets it via `COPY --from` (cached; never re-downloaded
# per build; no dependency on an external object store). This replaces the
# retired scripts/fetch-models.sh + the never-provisioned GCS bucket
# (`musaium-models-public`) that left /chat/compare returning 503 — P0.C1.
#
# Model:   vision tower of HF `google/siglip2-base-patch16-224`
# I/O:     input  pixel_values  [batch, 3, 224, 224]  float32
#          output pooler_output [batch, 768]          float32   <- the embedding
#          (also exposes last_hidden_state [*, 196, 768]; the adapter reads
#           pooler_output — see siglip-onnx.adapter.ts SIGLIP_OUTPUT_NAME)
# sha256:  c0573e3f4140c3a7c4e9cc5912bd6b26a033b46a6a8e8af26cbea262b163bcad
#
# Verify + build + push (provenance + the verify step are in README.md):
#   python3 deploy/model-base/verify-model.py deploy/model-base/siglip2-base-patch16-224.onnx
#   docker build -f deploy/model-base/Dockerfile \
#     -t ghcr.io/timmoyence/museum-backend-base:siglip-v1 deploy/model-base
#   docker push ghcr.io/timmoyence/museum-backend-base:siglip-v1
#
# `FROM scratch` keeps the image to exactly one layer = the model file, nothing
# else (no OS, no shell) — minimal surface, minimal pull size (~354 MB).
FROM scratch
COPY siglip2-base-patch16-224.onnx /models/siglip2-base-patch16-224.onnx
