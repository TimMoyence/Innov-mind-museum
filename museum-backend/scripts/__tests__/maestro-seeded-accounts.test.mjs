import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '@jest/globals';

const REPO_ROOT = resolve(process.cwd(), '..');
const read = (relativePath) => readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
const SEED_SCRIPT = 'museum-frontend/scripts/maestro-seed-accounts.sh';
const MAESTRO_DIR = resolve(REPO_ROOT, 'museum-frontend/.maestro');

const seedScript = existsSync(resolve(REPO_ROOT, SEED_SCRIPT)) ? read(SEED_SCRIPT) : '';

const flows = readdirSync(MAESTRO_DIR, { recursive: true })
  .filter((file) => String(file).endsWith('.yaml'))
  .map((file) => ({
    file: String(file),
    body: readFileSync(resolve(MAESTRO_DIR, String(file)), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n'),
  }));

const typedEmails = new Set(
  flows.flatMap(({ body }) => [...body.matchAll(/inputText: (["'])([^"'$]+@[^"']+)\1/g)].map((match) => match[2])),
);
const seededEmails = [...seedScript.matchAll(/^seed ([^\s]+@[^\s]+)/gm)].map((match) => match[1]);

describe('Maestro accounts are recreated before every shard attempt', () => {
  it('seeds the accounts the flows log in with, and only accounts a flow uses', () => {
    expect(seededEmails).toEqual(
      expect.arrayContaining([
        'e2e-test-login@test.musaium.dev',
        'apple.test@apple.com',
        'e2e-paywall@test.musaium.dev',
      ]),
    );
    for (const email of seededEmails) {
      expect(typedEmails).toContain(email);
    }
  });

  it('runs the seed at the start of each Android shard attempt', () => {
    const emulatorScript = read('museum-frontend/scripts/maestro-emulator-script.sh');
    const seedAt = emulatorScript.indexOf('maestro-seed-accounts.sh');
    expect(seedAt).toBeGreaterThan(-1);
    expect(seedAt).toBeLessThan(emulatorScript.indexOf('maestro-run-shard.sh'));
  });

  it('keeps one seeding path: the mobile workflow no longer inlines the seed command', () => {
    expect(read('.github/workflows/ci-cd-mobile.yml')).not.toContain('pnpm seed:e2e-maestro-account');
  });

  it('gives account deletion its own account, used by no other flow', () => {
    const deleteFlow = flows.find(({ file }) => file === 'auth-account-delete.yaml');
    const deleteEmail = deleteFlow?.body.match(/inputText: (["'])([^"']+@[^"']+)\1/)?.[2];
    expect(deleteEmail).toBeDefined();
    const others = flows.filter(({ file, body }) => file !== 'auth-account-delete.yaml' && body.includes(deleteEmail));
    expect(others.map(({ file }) => file)).toEqual([]);
  });
});
