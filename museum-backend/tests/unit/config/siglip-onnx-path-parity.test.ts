/**
 * CONTENT-03 — SigLIP ONNX model-path parity guard.
 *
 * The self-hosted SigLIP model path must be identical between the operator-
 * facing template (.env.example `SIGLIP_ONNX_MODEL_PATH`) and the two places
 * that actually put the file on disk:
 *   - prod:  `deploy/Dockerfile.prod` `COPY --from` the GHCR base image,
 *   - local: `scripts/pull-siglip-model.sh` `DEST`.
 * A drift (.env.example shipping the v1 `siglip-base-patch16-224.onnx` while the
 * build + code use the v2 `siglip2-base-patch16-224.onnx`) makes anyone copying
 * .env.example point at a file nothing provides → /chat/compare returns 503.
 *
 * (Pre-2026-06 this guard pointed at the now-retired scripts/fetch-models.sh,
 * which fetched the model from a GCS bucket. P0.C1 replaced that path: the model
 * is baked into the pinned GHCR base image and COPY'd into the prod build.)
 *
 * This guard is scoped to the ONNX *path* only — the Replicate model id
 * `lucataco/siglip-base-patch16-224` is a legitimately different (v1) artefact
 * and must NOT be flagged.
 */

import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const REPO = resolve(__dirname, '..', '..', '..');

function envExampleModelPath(): string {
  const text = readFileSync(resolve(REPO, '.env.example'), 'utf8');
  const m = /^SIGLIP_ONNX_MODEL_PATH=(.+)$/m.exec(text);
  if (!m) throw new Error('SIGLIP_ONNX_MODEL_PATH not found in .env.example');
  return m[1].trim();
}

function dockerfileModelDest(): string {
  const text = readFileSync(resolve(REPO, 'deploy', 'Dockerfile.prod'), 'utf8');
  // The base-image COPY wraps across lines via a trailing `\`; flatten first.
  const flat = text.replace(/\\\r?\n\s*/g, ' ');
  const m = /COPY --from=ghcr\.io\/\S*museum-backend-base:\S+\s+\S+\.onnx\s+(\S+\.onnx)/.exec(flat);
  if (!m) throw new Error('SigLIP `COPY --from` base image not found in Dockerfile.prod');
  return m[1].trim();
}

function pullScriptDest(): string {
  const text = readFileSync(resolve(REPO, 'scripts', 'pull-siglip-model.sh'), 'utf8');
  const m = /^DEST="\$\{SIGLIP_ONNX_DEST:-([^}]+)\}"$/m.exec(text);
  if (!m) throw new Error('DEST default not found in scripts/pull-siglip-model.sh');
  return m[1].trim();
}

describe('SigLIP ONNX model-path parity (.env.example ↔ prod build ↔ local pull)', () => {
  it('uses the same model filename in the template and the prod build COPY', () => {
    expect(basename(envExampleModelPath())).toBe(basename(dockerfileModelDest()));
  });

  it('uses the same model filename in the template and the local pull script', () => {
    expect(basename(envExampleModelPath())).toBe(basename(pullScriptDest()));
  });

  it('references the v2 siglip2 ONNX bundle (not the legacy v1 name)', () => {
    expect(basename(envExampleModelPath())).toBe('siglip2-base-patch16-224.onnx');
  });
});
