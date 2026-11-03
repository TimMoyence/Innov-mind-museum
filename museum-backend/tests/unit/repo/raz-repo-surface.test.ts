import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const APPS = ['.', 'museum-backend', 'museum-frontend', 'museum-web'];

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const list = (dir: string): string[] =>
  existsSync(join(ROOT, dir))
    ? readdirSync(join(ROOT, dir)).sort((a, b) => a.localeCompare(b))
    : [];

const EXTENSIONS = ['.mjs', '.cjs', '.js', '.ts', '.sh', '.py'];

function scriptReferences(text: string): string[] {
  return text
    .split(/[\s"'`;|&()=,]+/)
    .map((token) => {
      const at = Math.max(token.indexOf('scripts/'), token.indexOf('tools/'));
      return at >= 0 && token.slice(0, at).includes('$') ? token.slice(at) : token;
    })
    .filter((token) => {
      const segments = token.split('/');
      return segments.slice(0, -1).some((segment) => segment === 'scripts' || segment === 'tools');
    })
    .filter((token) => EXTENSIONS.some((extension) => token.endsWith(extension)))
    .filter((token) => !token.split('/').includes('dist'));
}

function danglingFrom(source: string, text: string, bases: string[]): string[] {
  return [...new Set(scriptReferences(text))]
    .filter((ref) => !bases.some((base) => existsSync(resolve(ROOT, base, ref))))
    .map((ref) => `${source} → ${ref}`);
}

describe('RAZ-M3-DOCS', () => {
  it('RAZ-M3-DOCS · la documentation et l’outillage /team ont disparu du dépôt', () => {
    const present = [
      'docs',
      'lib-docs',
      'audit-state',
      'artifacts',
      'learning',
      'team-reports',
      'team-promptfoo',
      'AGENTS.md',
      'CHANGELOG.md',
      '.claude/skills/team',
      '.claude/agents',
    ].filter((path) => existsSync(join(ROOT, path)));

    expect(present).toEqual([]);
  });

  it('RAZ-M3-DOCS · seuls les workflows de livraison restent', () => {
    expect(list('.github/workflows')).toEqual([
      'ci-cd-backend.yml',
      'ci-cd-mobile.yml',
      'ci-cd-web.yml',
      'codeql.yml',
      'deploy-privacy-policy.yml',
      'recall-e2e.yml',
    ]);
  });

  it('RAZ-M3-DOCS · seules les sentinelles gardées restent', () => {
    expect(APPS.flatMap((app) => list(join(app, 'scripts/sentinels')))).toEqual([
      'maestro-shard-manifest.mjs',
      'screen-test-coverage.mjs',
      'wellknown-placeholder-free.mjs',
      'web-cookies-audit.mjs',
      'web-domain-canonical.mjs',
    ]);
  });

  it('RAZ-M3-DOCS · aucun package.json, workflow ni hook ne lance un script disparu', () => {
    const fromPackages = APPS.flatMap((app) => {
      const manifest = join(app, 'package.json');
      const scripts = Object.values(
        (JSON.parse(read(manifest)) as { scripts?: Record<string, string> }).scripts ?? {},
      ).join('\n');
      return danglingFrom(manifest, scripts, [app]);
    });
    const fromWorkflows = list('.github/workflows').flatMap((file) =>
      danglingFrom(`.github/workflows/${file}`, read(`.github/workflows/${file}`), APPS),
    );
    const fromHooks = list('.husky')
      .filter((file) => !file.startsWith('_'))
      .flatMap((file) => danglingFrom(`.husky/${file}`, read(`.husky/${file}`), APPS));
    expect([...fromPackages, ...fromWorkflows, ...fromHooks]).toEqual([]);
  });
});
