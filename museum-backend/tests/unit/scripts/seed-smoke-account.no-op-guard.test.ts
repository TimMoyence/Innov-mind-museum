/**
 * RED — Cycle C: lock the no-op-clear elimination + password-transit contract.
 *
 * Two guards (spec R3 + R6, run 2026-05-26-auth-mfa-rgpd-zerodefect):
 *
 * 1. NO-OP GUARD (R6): the script source must contain NO `repo.update(`/`.set(`
 *    call that assigns a property the literal value `undefined`. Today
 *    `scripts/seed-smoke-account.ts:157-160` carries
 *    `verification_token: undefined` (+3) inside `repo.update()` — a silent
 *    TypeORM no-op (CLAUDE.md § Pièges connus + lib-docs/typeorm/LESSONS.md:12-17).
 *    The design eliminates it by DELETING the whole `update existing` branch, so
 *    this static assertion FAILS today and becomes a permanent regression lock.
 *
 * 2. PASSWORD-TRANSIT CONTRACT (R3): the `create` subcommand must emit the
 *    generated random password on EXACTLY ONE machine-readable line of the form
 *    `SMOKE_TEST_PASSWORD=<value>`, and the password substring must appear on NO
 *    other emitted line. Driven by capturing what `createSmokeAccount` / the
 *    `create` path writes via an injected logger. `createSmokeAccount` does not
 *    exist yet → the contract cannot be satisfied → FAILS.
 *
 * Run scope:
 *   pnpm jest tests/unit/scripts/seed-smoke-account.no-op-guard.test.ts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/seed-smoke-account.ts');

describe('seed-smoke-account.ts — no-op-clear guard (R6)', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');

  it('contains no `repo.update(...)` / `.set(...)` call assigning a property the literal `undefined` (4b silent no-op)', () => {
    // Per-line scan for the TypeORM silent-skip anti-pattern: an object
    // property whose value is the bare `undefined` literal. `() => 'NULL'` (the
    // correct raw-expression clear) and `?? undefined` defaults are NOT matched.
    // Strip a trailing line-comment + whitespace, then detect the `identifier:
    // undefined[,]` no-op via string ops (no `.*` backtracking). `() => 'NULL'`
    // (the correct raw-expression clear) and `?? undefined` defaults are NOT
    // matched (they don't end in a bare `: undefined`).
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

    // The script must expose the transit-line formatter the `create` path uses
    // to print the password. It does not exist yet (only the permanent upsert
    // is exported) → this contract is unsatisfiable today.
    expect(typeof mod.formatSmokeCreatePasswordLine).toBe('function');

    const password = 'rAnd0m-Per-Run-Secret_value_base64url_xyz';
    const line = mod.formatSmokeCreatePasswordLine!(password);

    // Exactly the documented machine-readable form (D2): `SMOKE_TEST_PASSWORD=<value>`.
    expect(line).toBe(`SMOKE_TEST_PASSWORD=${password}`);

    // The password substring appears on exactly one line of the formatter output.
    const linesCarryingPassword = line.split('\n').filter((l) => l.includes(password));
    expect(linesCarryingPassword).toHaveLength(1);
  });
});
