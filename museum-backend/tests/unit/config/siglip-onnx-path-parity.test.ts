/**
 * CONTENT-03 — SigLIP ONNX model-path parity guard.
 *
 * The self-hosted SigLIP model path must be identical between the operator-
 * facing template (.env.example `SIGLIP_ONNX_MODEL_PATH`) and the provisioning
 * script (scripts/fetch-models.sh `DEFAULT_DEST`). A drift (.env.example shipped
 * the v1 `siglip-base-patch16-224.onnx` while the script + code use the v2
 * `siglip2-base-patch16-224.onnx`) makes anyone copying .env.example point at a
 * file the script never downloads → /chat/compare returns 503.
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
  const m = text.match(/^SIGLIP_ONNX_MODEL_PATH=(.+)$/m);
  if (!m) throw new Error('SIGLIP_ONNX_MODEL_PATH not found in .env.example');
  return m[1].trim();
}

function fetchScriptDest(): string {
  const text = readFileSync(resolve(REPO, 'scripts', 'fetch-models.sh'), 'utf8');
  const m = text.match(/^DEFAULT_DEST="([^"]+)"$/m);
  if (!m) throw new Error('DEFAULT_DEST not found in scripts/fetch-models.sh');
  return m[1].trim();
}

describe('SigLIP ONNX model-path parity (.env.example ↔ fetch-models.sh)', () => {
  it('uses the same model filename in the template and the provisioning script', () => {
    expect(basename(envExampleModelPath())).toBe(basename(fetchScriptDest()));
  });

  it('references the v2 siglip2 ONNX bundle (not the legacy v1 name)', () => {
    expect(basename(envExampleModelPath())).toBe('siglip2-base-patch16-224.onnx');
  });
});
