import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/seed-smoke-account.ts');

describe('seed-smoke-account.ts — no-op-clear guard (R6)', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');

  it('contains no `repo.update(...)` / `.set(...)` call assigning a property the literal `undefined` (4b silent no-op)', () => {
    const stripComment = (line: string): string => {
      const i = line.indexOf('//');
      return (i === -1 ? line : line.slice(0, i)).trim();
    };
    const isIdentifier = (s: string): boolean => /^[A-Za-z_]\w*$/.test(s);

    const noOpLines = source
      .split('\n')
      .map((line, idx) => ({ line: stripComment(line), lineNo: idx + 1 }))
      .filter(({ line }) => {
        const body = line.endsWith(',') ? line.slice(0, -1) : line;
        const sep = body.indexOf(': ');
        if (sep === -1 || body.slice(sep + 2) !== 'undefined') return false;
        return isIdentifier(body.slice(0, sep));
      });

    expect(noOpLines).toEqual([]);
  });

  it('does not retain the misleading "Clear stale verification state" comment (UFR-013 — comment claimed an effect it never produced)', () => {
    expect(source).not.toMatch(/Clear stale verification state/);
  });
});

describe('seed-smoke-account.ts — create password-transit contract (R3)', () => {
  it('emits the random password on exactly one `SMOKE_TEST_PASSWORD=<value>` line and on no other line', async () => {
    const mod = (await import('../../../scripts/seed-smoke-account')) as {
      createSmokeAccount?: unknown;
      formatSmokeCreatePasswordLine?: (password: string) => string;
    };

    expect(typeof mod.formatSmokeCreatePasswordLine).toBe('function');

    const password = 'rAnd0m-Per-Run-Secret_value_base64url_xyz';
    const line = mod.formatSmokeCreatePasswordLine!(password);

    expect(line).toBe(`SMOKE_TEST_PASSWORD=${password}`);

    const linesCarryingPassword = line.split('\n').filter((l) => l.includes(password));
    expect(linesCarryingPassword).toHaveLength(1);
  });
});
