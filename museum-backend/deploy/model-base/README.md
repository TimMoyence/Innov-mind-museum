# SigLIP model base image — `museum-backend-base:siglip-v1`

This directory **owns** the SigLIP-2 vision-encoder ONNX that the
visual-similarity engine (`/chat/compare`, ADR-037) loads. The weights live in a
single-layer GHCR image; the production image pulls them in via `COPY --from`
(see `deploy/Dockerfile.prod`). There is **no external object store** in the
path — this is what closed P0.C1 (the never-provisioned `musaium-models-public`
GCS bucket that made `/chat/compare` return 503).

The `.onnx` file itself is **not committed to git** (~354 MB; see `.gitignore`).
The canonical artefact is the GHCR image, which is reproducible from the
provenance below.

## What the model is (verified)

| Property | Value |
|---|---|
| Source model | HF [`google/siglip2-base-patch16-224`](https://huggingface.co/google/siglip2-base-patch16-224) — **vision tower only** |
| Input | `pixel_values` `[batch, 3, 224, 224]` float32 |
| Output (used) | `pooler_output` `[batch, 768]` float32 — the L2-normalisable image embedding |
| Output (other) | `last_hidden_state` `[*, 196, 768]` — unused by the adapter |
| File | `siglip2-base-patch16-224.onnx` |
| sha256 | `c0573e3f4140c3a7c4e9cc5912bd6b26a033b46a6a8e8af26cbea262b163bcad` |
| Image | `ghcr.io/timmoyence/museum-backend-base:siglip-v1` |

The I/O contract above was validated directly against the file with onnxruntime
(`verify-model.py`). The runtime adapter reads `pooler_output` — see
`SIGLIP_OUTPUT_NAME` in `siglip-onnx.adapter.ts`.

## Provenance & honesty note

The `.onnx` is a **pre-exported ONNX of the SigLIP-2 vision tower** of
`google/siglip2-base-patch16-224` (the vision encoder that yields
`pooler_output`). It was validated — not exported — locally with onnxruntime
(`verify-model.py`); the toolchain used to produce it was not PyTorch on this
machine, so this README does **not** claim a specific `torch.onnx.export`
invocation produced *this* byte layout.

If you ever need to regenerate it from source, the reference recipe is a
transformers `SiglipVisionModel` export (opset ≥ 17, dynamic `batch`). **A
re-export will almost certainly produce a different sha256** (opset / library /
graph-optimisation dependent). When that happens, re-pin the hash in all four
places that reference it: `verify-model.py`, `deploy/model-base/Dockerfile`,
`scripts/pull-siglip-model.sh`, and bump the image tag (`siglip-v2`). Do not
ship a model whose I/O contract differs from the table above without updating
`siglip-onnx.adapter.ts`.

## (Re)build & push the base image

```bash
# 1. Put the verified .onnx in this directory (deploy/model-base/).
#    For local dev you usually only need scripts/pull-siglip-model.sh instead.

# 2. Verify it matches the pinned sha256 + the I/O contract.
python3 deploy/model-base/verify-model.py \
  deploy/model-base/siglip2-base-patch16-224.onnx

# 3. Build the single-layer base image and push it.
docker build -f deploy/model-base/Dockerfile \
  -t ghcr.io/timmoyence/museum-backend-base:siglip-v1 deploy/model-base
docker push ghcr.io/timmoyence/museum-backend-base:siglip-v1
```

The base image is currently **private**; the CI deploy job authenticates to
GHCR (`docker/login-action`) before building `Dockerfile.prod`, so the
`COPY --from` pull works without making it public. Make it public only if an
unauthenticated build context ever needs it.

## Local development

To get the exact same weights locally (so dev and prod load byte-identical
files), run from `museum-backend/`:

```bash
bash scripts/pull-siglip-model.sh   # docker pull the base + extract the .onnx
```

This writes `./models/siglip2-base-patch16-224.onnx`, the path
`SIGLIP_ONNX_MODEL_PATH` defaults to in `.env.example`.
