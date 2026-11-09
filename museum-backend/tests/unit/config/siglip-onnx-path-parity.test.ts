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
