# SigLIP-2 ONNX provisioning runbook

> **Scope** — operationalises `museum-backend/scripts/fetch-models.sh`
> (Docker-build-time fetch of the ~340 MB SigLIP-2 ONNX bundle backing the
> `siglip-onnx` `EmbeddingsPort` adapter / `POST /chat/compare`).
>
> **Status** — *bucket not yet provisioned at V1 launch (2026-06-07)*. The
> tolerance branch in `fetch-models.sh` keeps deploys green via the
> `EMBEDDINGS_PROVIDER=replicate` managed fallback. This runbook captures
> the steps to flip from tolerance to pinned-SHA enforcement once ops
> stands up the GCS bucket.

## 1. Target artefact

- **Model**: `google/siglip2-base-patch16-224`
  ([HF card](https://huggingface.co/google/siglip2-base-patch16-224)).
- **Export**:
  ```bash
  optimum-cli export onnx \
    --model google/siglip2-base-patch16-224 \
    ./models/siglip2-base-patch16-224
  ```
  Produces `model.onnx` + `tokenizer.*` siblings. Only `model.onnx` ships
  via this script (the tokenizer is bundled with `@xenova/transformers` at
  runtime).
- **Bucket target**:
  - URL pattern: `https://storage.googleapis.com/<BUCKET>/siglip2-base-patch16-224.onnx`
  - Default (placeholder): `https://storage.googleapis.com/musaium-models-public/siglip2-base-patch16-224.onnx`
  - Override via `SIGLIP_ONNX_URL=...` in CI env when the canonical URL changes.

## 2. Generate the integrity SHA

Once `model.onnx` is exported locally :

```bash
sha256sum ./models/siglip2-base-patch16-224/model.onnx
# → <64-hex-chars>  ./models/siglip2-base-patch16-224/model.onnx
```

**Do NOT** commit the hash anywhere in the repository — it lives only in
CI secrets and the cut-track table below. The deploy pipeline injects it
at build time so a drift between bucket content and the pin fails the
build loudly (`fetch-models.sh` branch (c)).

## 3. Inject the SHA into CI

GitHub Actions repository secret :

| Secret name           | Value                                     | Used by                                                       |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `SIGLIP_ONNX_SHA256`  | `SHA256_TO_BE_FILLED_AT_DEPLOY` (placeholder) | `.github/workflows/ci-cd-backend.yml` build-image step (passed to `--build-arg SIGLIP_ONNX_SHA256=...` for `Dockerfile.prod`). |

The Dockerfile passes it through to `fetch-models.sh` via the build env so
both the script branches (a) "fail-loud on 404" and (c) "fail-loud on
drift" become active simultaneously the moment the secret is set.

> **Placeholder convention** — until the bucket goes live, keep the secret
> *unset* in CI (NOT set to the placeholder string). `fetch-models.sh`
> branch (b) detects the unset variable and degrades gracefully to a
> `WARNING` log + exit 0. Setting the secret = explicit "production is
> ready" signal.

## 4. Bucket-provisioning checklist (ops)

1. Create `gs://musaium-models-public` (or rename via `SIGLIP_ONNX_URL`).
2. `gsutil cp ./models/siglip2-base-patch16-224/model.onnx gs://<bucket>/`.
3. `gsutil acl ch -u AllUsers:R gs://<bucket>/siglip2-base-patch16-224.onnx`
   (public-read — the model weights are Apache-2.0 from Google).
4. Compute SHA per §2 above, set the GitHub Actions secret per §3.
5. Trigger a backend redeploy ; verify the build log shows
   `fetch-models: sha256 verified.` (NOT `WARNING — download failed …`).
6. Smoke `POST /chat/compare` against the deployed image — confirm
   `EMBEDDINGS_PROVIDER=siglip-onnx` resolves a match (no `replicate`
   fallback in the trace).

## 5. Rotating the bundle

When upgrading SigLIP or re-exporting :

1. Re-export with the new revision (`optimum-cli ...`).
2. `sha256sum` the new file.
3. **Stage the rotation** :
   - Upload the new artefact under a versioned key
     (`siglip2-base-patch16-224.v<N>.onnx`).
   - Override `SIGLIP_ONNX_URL` for one canary deploy to the versioned key.
   - Update `SIGLIP_ONNX_SHA256` to the new hash.
   - If canary OK, atomic-swap the unversioned key
     (`gsutil cp gs://<bucket>/siglip2-base-patch16-224.v<N>.onnx gs://<bucket>/siglip2-base-patch16-224.onnx`)
     and rollback the URL override.
4. Old version key kept ≥ 7 d for rollback before garbage-collecting.

## 6. Local development override

`fetch-models.sh` reads `SIGLIP_ONNX_DEST` to override the output path —
useful when developing against a model copy on a fast SSD :

```bash
SIGLIP_ONNX_URL=file:///path/to/local/model.onnx \
SIGLIP_ONNX_DEST=./tmp/siglip-dev.onnx \
SIGLIP_ONNX_SHA256=$(sha256sum /path/to/local/model.onnx | awk '{print $1}') \
bash scripts/fetch-models.sh
```

## 7. Failure modes (covered by `fetch-models.sh.test.ts`, T-A5)

| Scenario                                       | Exit | Log line                                      |
| ---------------------------------------------- | ---- | --------------------------------------------- |
| URL 404 + `SIGLIP_ONNX_SHA256` set             | ≠ 0  | `fetch-models: download failed (URL=…)`       |
| URL 404 + `SIGLIP_ONNX_SHA256` UNSET           | 0    | `fetch-models: WARNING — download failed …`   |
| Pre-existing file with SHA drift               | ≠ 0  | `fetch-models: sha256 drift … re-downloading` |
| Pre-existing file matching SHA                 | 0    | `fetch-models: $DEST present and sha256 matches` |
| Successful download with SHA verify            | 0    | `fetch-models: sha256 verified.` + `success`  |

Regression coverage : `tests/integration/scripts/fetch-models.sh.test.ts`.

## 8. References

- `museum-backend/scripts/fetch-models.sh` — the script.
- `museum-backend/Dockerfile.prod` — builder stage that invokes the script.
- `.github/workflows/ci-cd-backend.yml` — `SIGLIP_ONNX_SHA256` plumbing.
- spec.md §0 / design.md §3 C1 (UFR-022 Wave A) — fail-loud + tolerance
  contract.
- `tests/integration/scripts/fetch-models.sh.test.ts` (T-A5) — 3-branch
  coverage so a future edit of the script never silently regresses the
  R-C1 / R-C1b non-regression invariants.
