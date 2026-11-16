import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const ENV_EXAMPLE = resolve(__dirname, '..', '..', '..', '.env.example');

const absolutePaths = readFileSync(ENV_EXAMPLE, 'utf8')
  .split('\n')
  .map((line) => /^([A-Z0-9_]+(?:_DIR|_PATH))=(.+)$/.exec(line.trim()))
  .filter((match): match is RegExpExecArray => match !== null)
  .filter(([, , value]) => isAbsolute(value.trim()))
  .map(([, key, value]) => `${key}=${value.trim()}`);

describe('CHEMINS-HOTE', () => {
  it('CHEMINS-HOTE · le modèle .env.example, copié pour `pnpm dev` sur le poste, ne fixe aucun dossier absolu de conteneur (un upload local tentait mkdir /app)', () => {
    expect(absolutePaths).toEqual([]);
  });
});
