# SigLIP-2 ONNX provisioning runbook — SUPERSEDED

> **Superseded 2026-06-14 (P0.C1).** This runbook described the retired
> GCS-bucket fetch path (`scripts/fetch-models.sh` + `musaium-models-public`),
> which was never provisioned and left `POST /chat/compare` returning 503.
>
> The SigLIP ONNX is now **owned and baked** into a pinned GHCR base image
> (`ghcr.io/timmoyence/museum-backend-base:siglip-v1`) and copied into the prod
> image via `COPY --from` (`museum-backend/deploy/Dockerfile.prod`). There is no
> external bucket, no per-build download, and no operator action required for
> prod.

The canonical runbook is now:

- **[`docs/operations/SIGLIP_MODEL_PROVISIONING.md`](../../../docs/operations/SIGLIP_MODEL_PROVISIONING.md)** — overview, local-dev pull, Replicate fallback, smoke checklist.
- **[`museum-backend/deploy/model-base/README.md`](../../deploy/model-base/README.md)** — provenance, `verify-model.py`, and the build + push recipe for the base image.

For local development, run from `museum-backend/`:

```bash
bash scripts/pull-siglip-model.sh
```
